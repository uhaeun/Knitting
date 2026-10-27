// Hard-coded disposable Supabase only. Never accepts a hosted URL or DB target.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { signUp } from './signup.mjs';
const API='http://127.0.0.1:54321',DB='postgresql://postgres:postgres@127.0.0.1:54322/postgres',BASE='http://localhost:8098';
const anon=process.env.SB_ANON_KEY?.replace(/^"|"$/g,''),service=process.env.SB_SERVICE_ROLE_KEY?.replace(/^"|"$/g,'');
const secret=readFileSync('/tmp/p0-functions.env','utf8').split('\n').find(s=>s.startsWith('CLEANUP_WORKER_SECRET='))?.split('=')[1];assert.ok(anon&&service&&secret);
const sql=(q:string)=>execFileSync('psql',[DB,'-X','-v','ON_ERROR_STOP=1','-tAc',q],{encoding:'utf8'}).trim();
const sb=createClient(API,service,{auth:{persistSession:false,autoRefreshToken:false}});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}});await page.addInitScript(()=>localStorage.setItem('knitting.tourSeen','1'));
const cases:string[]=[];
const storage=execFileSync('docker',['ps','--format','{{.Names}}'],{encoding:'utf8'}).split('\n').find(s=>s.startsWith('supabase_storage_'));assert.ok(storage);
const env=JSON.parse(execFileSync('docker',['inspect',storage,'--format','{{json .Config.Env}}'],{encoding:'utf8'})) as string[];
const root=env.find(s=>s.startsWith('STORAGE_FILE_BACKEND_PATH='))?.split('=')[1]??env.find(s=>s.startsWith('FILE_STORAGE_BACKEND_PATH='))?.split('=')[1];assert.ok(root?.startsWith('/'));
const bytes=(rid:string)=>execFileSync('docker',['exec',storage,'find',root,'-type','f'],{encoding:'utf8'}).split('\n').filter(s=>s.includes(rid));
try {
  // Previous cron validation finished; stop its timer only in this throwaway DB
  // so fault-injection and exact claim assertions cannot race scheduled workers.
  sql("select cron.unschedule(jobid) from cron.job where jobname='knitting-result-cleanup'");
  const username=`ops_${Date.now().toString(36)}`;
  await signUp(page,{base:BASE,email:`${username}@example.com`,username,displayName:'운영자 QA',password:'password123'});
  const session=await page.evaluate(()=>{const k=Object.keys(localStorage).find(s=>/^sb-.*-auth-token$/.test(s));return JSON.parse(localStorage.getItem(k!)!);});
  const owner=session.user.id;assert.match(owner,/^[a-f0-9-]{36}$/);
  const client=createClient(API,anon,{auth:{persistSession:false,autoRefreshToken:false}});assert.equal((await client.auth.setSession(session)).error,null);
  const rpc=async(name:string,args:Record<string,unknown>={},get=false)=>{const r=await client.rpc(name,args,{get});assert.equal(r.error,null,`${name}: ${r.error?.message}`);return r.data;};
  assert.deepEqual(await rpc('operator_cleanup_access',{},true),{allowed:false,can_execute:false});
  assert.ok((await client.rpc('operator_cleanup_cases',{}, {get:true})).error);
  assert.ok((await client.from('cleanup_operators').insert({user_id:owner,role:'executor'})).error);
  sql(`insert into cleanup_operators(user_id,role)values('${owner}','executor');insert into result_retention_reviewers(user_id)values('${owner}')`);
  const pid=randomUUID();assert.equal((await sb.from('projects').insert({id:pid,owner_id:owner,name:'보존할 원본 편물'})).error,null);
  const jpeg=readFileSync('/tmp/legacy-link.jpg');
  const add=async(legacy=false)=>{
    const ed=await rpc('prepare_result_edition',{pid,recipe:randomUUID().replaceAll('-','').repeat(2)});const rid=ed[0].id;
    const paths=[`${owner}/${pid}/results/${rid}.jpg`,`${owner}/${pid}/results/${rid}_t.jpg`];
    for(const p of paths) assert.equal((await sb.storage.from('photos').upload(p,jpeg,{contentType:'image/jpeg'})).error,null);
    assert.equal((await client.from('results').insert({id:rid,project_id:pid,owner_id:owner,kind:'single',ratio:'1:1',output:'jpeg',edition_id:rid,file_path:paths[0],thumb_path:paths[1],display_title_override:'노출 금지 제목'})).error,null);
    if(legacy) sql(`update results set legacy_links_unverified=true where id='${rid}'`);
    await rpc('delete_result',{result_id:rid});return {rid,paths};
  };
  const review=async(rid:string,decision:string)=>rpc('review_result_retention',{rid,decision,reference:'qa:synthetic'});
  // Exhaust through twelve real worker invocations and real Storage rejections.
  // Temporary fault is limited to this test owner's paths in the disposable DB.
  sql(`create function public.qa_operator_storage_fault()returns trigger language plpgsql as $$begin if OLD.name like '${owner}/${pid}/results/%' then raise exception 'synthetic Storage failure';end if;return OLD;end $$;create trigger qa_operator_fault before delete on storage.objects for each row execute function public.qa_operator_storage_fault()`);
  const f=await add();assert.equal((await rpc('preview_manual_result_cleanup',{rid:f.rid})).reason,'RETENTION_UNKNOWN');
  await review(f.rid,'hold');assert.equal((await rpc('preview_manual_result_cleanup',{rid:f.rid})).reason,'RETENTION_HOLD');await review(f.rid,'clear');
  const work=async()=>{const r=await fetch(`${API}/functions/v1/cleanup-results`,{method:'POST',headers:{Authorization:`Bearer ${secret}`}});assert.equal(r.status,200,await r.clone().text());return r.json();};
  for(let n=0;n<12;n++) {sql(`update result_cleanup_objects o set next_attempt_at=clock_timestamp()-interval '1 second' from result_cleanup_jobs j where j.id=o.job_id and j.result_id='${f.rid}' and o.status<>'failed_exhausted'`);await work();}
  assert.equal(sql(`select bool_and(o.auto_attempts=6 and o.status='failed_exhausted' and o.next_attempt_at is null)from result_cleanup_objects o join result_cleanup_jobs j on j.id=o.job_id where j.result_id='${f.rid}'`),'t');assert.ok(bytes(f.rid).length>=2);
  cases.push('real Storage fault exhausts each object at six automatic attempts; bytes preserved');
  // Allow the original but keep thumbnail faulted for a genuine partial run.
  sql(`create or replace function public.qa_operator_storage_fault()returns trigger language plpgsql as $$begin if OLD.name='${f.paths[1]}' then raise exception 'synthetic thumbnail failure';end if;return OLD;end $$`);
  await page.goto(`${BASE}/operations`);const row=page.getByTestId(`operator-case-${f.rid}`);await row.getByText('미삭제 2개',{exact:false}).waitFor();
  let requests=0;page.on('request',r=>{if(r.url().includes('/rpc/request_manual_result_cleanup')&&r.method()==='POST')requests++;});
  await row.getByRole('button',{name:'단건 재처리 확인',exact:true}).click();await page.getByText(`결과물 ID: ${f.rid}`,{exact:true}).last().waitFor();await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(requests,0);
  await row.getByRole('button',{name:'단건 재처리 확인',exact:true}).click();await page.getByText('미삭제 2개 · JPEG',{exact:true}).waitFor();
  sql(`update result_cleanup_objects o set last_code='NETWORK_ERROR' from result_cleanup_jobs j where o.job_id=j.id and j.result_id='${f.rid}'`);
  await page.getByRole('button',{name:'이 결과물 다시 처리',exact:true}).click();await page.getByText('확인 정보 변경 · 다시 확인 필요',{exact:true}).waitFor();assert.equal(sql(`select count(*) from result_cleanup_runs where result_id='${f.rid}'`),'0');
  cases.push('dialog cancellation sends no request; stale confirmation is rejected and audited');
  await row.getByRole('button',{name:'단건 재처리 확인',exact:true}).click();await page.getByText('미삭제 2개 · JPEG',{exact:true}).waitFor();
  await page.getByRole('button',{name:'이 결과물 다시 처리',exact:true}).click();await page.getByText('서버에 단건 처리를 요청했어요.',{exact:true}).waitFor();
  const run=sql(`select id from result_cleanup_runs where result_id='${f.rid}'`);const status=async(id=run)=>rpc('operator_cleanup_status',{run_id:id,request_id:randomUUID()},true);
  const before=await status();assert.equal(before.status_version,'1');assert.equal(before.status,'queued');assert.ok(!JSON.stringify(before).includes('/results/'));
  const stored=sql(`select request_id||':'||preview_id from result_cleanup_runs where id='${run}'`).split(':');
  assert.equal((await rpc('request_manual_result_cleanup',{rid:f.rid,preview_id:stored[1],request_id:stored[0]})).job_id,run);
  const bad=await client.rpc('request_manual_result_cleanup',{rid:f.rid,preview_id:stored[1],request_id:randomUUID(),paths:[f.paths[0]]});assert.ok(bad.error);
  // viewer can inspect but cannot queue; preserve generation of original actor
  // until an explicit revocation test later.
  const u=await sb.auth.admin.createUser({email:`viewer_${username}@example.com`,password:'password123',email_confirm:true});assert.equal(u.error,null);const viewer=u.data.user!.id;
  assert.equal((await sb.from('profiles').insert({id:viewer,username:`v_${username}`,display_name:'조회 QA'})).error,null);
  sql(`insert into cleanup_operators(user_id,role)values('${viewer}','viewer')`);
  const vc=createClient(API,anon,{auth:{persistSession:false,autoRefreshToken:false}});assert.equal((await vc.auth.signInWithPassword({email:`viewer_${username}@example.com`,password:'password123'})).error,null);
  assert.equal((await vc.rpc('request_manual_result_cleanup',{rid:f.rid,preview_id:stored[1],request_id:randomUUID()})).data.reason,'EXECUTOR_REQUIRED');
  await work();const first=await status();assert.equal(first.status_version,'3');assert.equal(first.status,'processing');assert.equal(first.objects.filter((o:any)=>o.status==='confirmed').length,1);
  await work();const partial=await status();assert.equal(partial.status_version,'5');assert.equal(partial.status,'partial');assert.notEqual(partial.cleanup_status,'confirmed');
  assert.equal((await sb.storage.from('photos').download(f.paths[0])).error!==null,true);assert.equal((await sb.storage.from('photos').download(f.paths[1])).error,null);
  const count=sql(`select sum(manual_attempts) from result_cleanup_objects o join result_cleanup_jobs j on j.id=o.job_id where j.result_id='${f.rid}'`);await work();assert.equal(sql(`select sum(manual_attempts) from result_cleanup_objects o join result_cleanup_jobs j on j.id=o.job_id where j.result_id='${f.rid}'`),count);
  cases.push('read-only viewer, exact RPC arguments, idempotency, string versions 1→3→5 and actual partial Storage success');
  // Status GETs are read-only and do not allocate a version or run a worker.
  const rows=sql(`select count(*) from cleanup_operator_audit where run_id='${run}'`);for(let n=0;n<3;n++)assert.equal((await status()).status_version,'5');assert.equal(sql(`select count(*) from cleanup_operator_audit where run_id='${run}'`),rows);
  await page.getByTestId('operator-run').getByRole('button',{name:'상태 다시 확인',exact:true}).click();
  await page.getByText('부분 성공 · 미완료',{exact:true}).waitFor();assert.equal(await page.locator('img,video').count(),0);assert.equal(await page.getByText('노출 금지 제목',{exact:true}).count(),0);
  await page.screenshot({path:'/tmp/operator-cleanup-partial.png',fullPage:true});
  cases.push('operator UI distinguishes partial and cumulative completion without deleted titles/media/paths');
  // Revoke after claim: final actual Storage transaction must preserve bytes.
  const p=await rpc('preview_manual_result_cleanup',{rid:f.rid});assert.equal(p.remaining,1);const r=await rpc('request_manual_result_cleanup',{rid:f.rid,preview_id:p.preview_id,request_id:randomUUID()});
  const t=await sb.rpc('claim_result_cleanup');assert.equal(t.error,null);sql(`update cleanup_operators set role='viewer' where user_id='${owner}'`);
  const removal=await sb.storage.from('photos').remove([t.data.object.path]);assert.ok(removal.error||removal.data?.length===0);assert.equal((await sb.storage.from('photos').download(f.paths[1])).error,null);
  assert.equal((await sb.rpc('finish_result_cleanup',{jid:t.data.id,token:t.data.token,outcome:'VERIFY_FAILED'})).error,null);assert.equal((await status(r.job_id)).reason,'OPERATOR_REVOKED');
  sql(`update cleanup_operators set role='executor' where user_id='${owner}';drop trigger qa_operator_fault on storage.objects;drop function public.qa_operator_storage_fault()`);
  const p2=await rpc('preview_manual_result_cleanup',{rid:f.rid});const r2=await rpc('request_manual_result_cleanup',{rid:f.rid,preview_id:p2.preview_id,request_id:randomUUID()});await work();const complete=await status(r2.job_id);
  assert.equal(complete.status,'succeeded');assert.equal(complete.cleanup_status,'confirmed');assert.equal(complete.objects.find((o:any)=>o.asset==='file').manual_attempts,1);assert.equal(bytes(f.rid).length,0);
  assert.equal(sql(`select bool_and(o.auto_attempts=6 and o.next_attempt_at is null)from result_cleanup_objects o join result_cleanup_jobs j on j.id=o.job_id where j.result_id='${f.rid}'`),'t');
  assert.equal(sql(`select name from projects where id='${pid}'`),'보존할 원본 편물');
  cases.push('role revoked after claim fences actual Storage; fresh confirmation retries thumbnail only; physical bytes absent and auto schedule stays exhausted');
  const legacy=await add(true);await review(legacy.rid,'clear');assert.equal((await rpc('preview_manual_result_cleanup',{rid:legacy.rid})).reason,'LINKS_UNCONFIRMED');
  const aud=await rpc('operator_cleanup_audit',{run_id:run},true);assert.ok(aud.some((a:any)=>a.code==='ABSENT_CONFIRMED'));assert.ok(!JSON.stringify(aud).includes('/results/'));
  // Fault report is separate from status GET and deduplicated by minimal error ID.
  const eid=randomUUID();for(let n=0;n<2;n++)await rpc('report_cleanup_snapshot_issue',{run_id:run,error_id:eid,version:'5',checked_at:complete.checked_at});assert.equal(sql(`select count(*) from cleanup_operator_audit where error_id='${eid}'`),'1');
  cases.push('unverified legacy CDN still blocks; minimum fault audit is deduplicated and status reads stay side-effect free');
  // MAX is injected only by a disposable test fixture; no runtime RPC can set it.
  sql(`alter table result_cleanup_runs disable trigger manual_cleanup_version;update result_cleanup_runs set status_version=9223372036854775807 where id='${r2.job_id}';alter table result_cleanup_runs enable trigger manual_cleanup_version`);
  assert.equal((await status(r2.job_id)).status_version,'9223372036854775807');assert.equal((await status(r2.job_id)).integrity_code,'VERSION_LIMIT');
  assert.equal((await rpc('preview_manual_result_cleanup',{rid:f.rid})).reason,'VERSION_LIMIT');
  cases.push('saturated BIGINT serializes exactly and prevents new generation reset');
  writeFileSync('/tmp/operator-cleanup-results.json',JSON.stringify({pass:true,environment:'disposable-local-supabase',cases},null,2));console.log(JSON.stringify({pass:true,cases},null,2));
} catch(error) {writeFileSync('/tmp/operator-cleanup-results.json',JSON.stringify({pass:false,cases,error:String(error)},null,2));await page.screenshot({path:'/tmp/operator-cleanup-failure.png',fullPage:true}).catch(()=>undefined);throw error;}
finally {await browser.close();}
