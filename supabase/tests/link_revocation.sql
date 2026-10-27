-- Disposable database only, synthetic metadata; every row and flag is rolled back.
begin;
set local storage.allow_delete_query='true';
create temporary table checks(label text,ok boolean);
create function pg_temp.check_that(label text,ok boolean) returns void language sql as $$insert into checks values(label,ok)$$;
create function pg_temp.as_user(uid uuid,stmt text) returns boolean language plpgsql as $$
begin
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claims',json_build_object('sub',uid)::text,true);
 begin execute stmt;exception when others then perform set_config('role','postgres',true);return false;end;
 perform set_config('role','postgres',true);return true;
end $$;
insert into auth.users(id,email)values('71111111-1111-4111-8111-111111111111','rotation-a@test.invalid'),('72222222-2222-4222-8222-222222222222','rotation-b@test.invalid');
insert into profiles(id,username,display_name)values('71111111-1111-4111-8111-111111111111','rotation_a','가'),('72222222-2222-4222-8222-222222222222','rotation_b','나');
insert into projects(id,owner_id,name,default_visibility)values('73333333-3333-4333-8333-333333333333','71111111-1111-4111-8111-111111111111','테스트','public');
insert into results(id,project_id,owner_id,kind,ratio,output,file_path,thumb_path,legacy_links_unverified)
 values('74444444-4444-4444-8444-444444444444','73333333-3333-4333-8333-333333333333','71111111-1111-4111-8111-111111111111','single','1:1','jpeg',
 '71111111-1111-4111-8111-111111111111/73333333-3333-4333-8333-333333333333/results/74444444-4444-4444-8444-444444444444.jpg',
 '71111111-1111-4111-8111-111111111111/73333333-3333-4333-8333-333333333333/results/74444444-4444-4444-8444-444444444444_t.jpg',true);
select pg_temp.check_that('public legacy result not gratuitously rotated',not exists(select 1 from result_link_jobs));
select pg_temp.as_user('71111111-1111-4111-8111-111111111111',$$select set_project_visibility('73333333-3333-4333-8333-333333333333','private')$$);
select pg_temp.check_that('privacy and durable job commit together',(select visibility='private' from results) and (select count(*)=1 from result_link_jobs) and (select count(*)=2 from result_link_objects));
select pg_temp.check_that('foreign retry denied',not pg_temp.as_user('72222222-2222-4222-8222-222222222222',$$select retry_my_link_revocation('74444444-4444-4444-8444-444444444444')$$));
select pg_temp.check_that('client cannot claim worker jobs',not pg_temp.as_user('71111111-1111-4111-8111-111111111111',$$select claim_link_revocation()$$));
select pg_temp.check_that('client cannot read internal paths or probes',not pg_temp.as_user('71111111-1111-4111-8111-111111111111',$$select * from result_link_objects$$));
select claim_link_revocation() as claimed \gset
select (:'claimed'::jsonb->>'id') as jid,(:'claimed'::jsonb->>'token') as token \gset
select pg_temp.check_that('one lease prevents a duplicate claim',claim_link_revocation() is null);
select pg_temp.check_that('lease snapshot contains two exact objects',jsonb_array_length(link_job_snapshot(:'jid',:'token')->'objects')=2);
select pg_temp.check_that('first automatic attempt counted once',(select auto_attempts=1 and manual_attempts=0 from result_link_jobs));
do $$declare j result_link_jobs;o result_link_objects;blocked boolean:=false;begin
 select * into j from result_link_jobs;select * into o from result_link_objects limit 1;
 perform record_link_object(j.id,j.lease_token,o.id,'prepared',repeat('a',64),'https://cdn.test/probe');
 begin perform record_link_object(j.id,j.lease_token,o.id,'activated');exception when others then blocked:=true;end;
 perform pg_temp.check_that('activation requires an actual replacement object',blocked);
 blocked:=false;
 begin perform link_job_snapshot(j.id,gen_random_uuid());exception when others then blocked:=true;end;
 perform pg_temp.check_that('stale lease cannot update a job',blocked);
end $$;
-- Privacy stays private after failures, each interval is from failure completion.
select finish_link_revocation(:'jid',:'token','STORAGE_ERROR');
select pg_temp.check_that('failure preserves privacy',(select visibility='private' from results));
select pg_temp.check_that('first failure schedules plus one minute',(select next_attempt_at between clock_timestamp()+interval '59 seconds' and clock_timestamp()+interval '61 seconds' from result_link_jobs));
do $$declare n int;claim jsonb;seconds int;begin
 for n in 2..6 loop
  update result_link_jobs set next_attempt_at=clock_timestamp()-interval '1 second';
  claim:=claim_link_revocation();perform finish_link_revocation((claim->>'id')::uuid,(claim->>'token')::uuid,'STORAGE_ERROR');
  seconds:=case n when 2 then 300 when 3 then 900 when 4 then 3600 else 10800 end;
  if n<6 then perform pg_temp.check_that('retry delay after attempt '||n,(select next_attempt_at between clock_timestamp()+make_interval(secs=>seconds-1) and clock_timestamp()+make_interval(secs=>seconds+1) from result_link_jobs));end if;
 end loop;
end $$;
select pg_temp.check_that('six attempts exhaust automatic retries',(select auto_attempts=6 and status='failed_exhausted' and next_attempt_at is null from result_link_jobs));
select pg_temp.check_that('no seventh automatic claim',claim_link_revocation() is null);
select pg_temp.check_that('owner can request manual retry',pg_temp.as_user('71111111-1111-4111-8111-111111111111',$$select retry_my_link_revocation('74444444-4444-4444-8444-444444444444')$$));
select claim_link_revocation() as claimed \gset
select (:'claimed'::jsonb->>'token') as token \gset
select pg_temp.check_that('manual retry never resets automatic counter',(select auto_attempts=6 and manual_attempts=1 from result_link_jobs));
-- Only server-derived paths are activated, and only after stored object existence.
insert into storage.objects(bucket_id,name,owner)select 'photos',target_path,'71111111-1111-4111-8111-111111111111'::uuid from result_link_objects;
do $$declare o result_link_objects; j result_link_jobs;begin
 select * into j from result_link_jobs;
 for o in select * from result_link_objects loop
  perform record_link_object(j.id,j.lease_token,o.id,'prepared',repeat('a',64),'https://cdn.test/probe',null,true);
  perform record_link_object(j.id,j.lease_token,o.id,'activated');
  perform record_link_object(j.id,j.lease_token,o.id,'removed');
  perform record_link_object(j.id,j.lease_token,o.id,'origin_blocked',null,null,404);
 end loop;
end $$;
select pg_temp.check_that('gateway now targets verified replacement',(select path like '%/revoked/%/file.jpg' from result_media_target('74444444-4444-4444-8444-444444444444','71111111-1111-4111-8111-111111111111','2','file')));
select pg_temp.check_that('retired path cannot be resurrected',not pg_temp.as_user('71111111-1111-4111-8111-111111111111',$$insert into storage.objects(bucket_id,name)values('photos','71111111-1111-4111-8111-111111111111/73333333-3333-4333-8333-333333333333/results/74444444-4444-4444-8444-444444444444.jpg')$$));
select pg_temp.check_that('new posts cannot race by referencing a result path',not pg_temp.as_user('71111111-1111-4111-8111-111111111111',$$insert into posts(project_id,owner_id,photo_path,thumb_path,width,height,taken_at)values('73333333-3333-4333-8333-333333333333','71111111-1111-4111-8111-111111111111','71111111-1111-4111-8111-111111111111/73333333-3333-4333-8333-333333333333/results/74444444-4444-4444-8444-444444444444.jpg','thumb',1,1,now())$$));
select finish_link_revocation(:'jid',:'token','CDN_UNVERIFIED');
select pg_temp.check_that('origin-only verification cannot clear warning',(select status='failed_exhausted' from result_link_jobs) and(select legacy_links_unverified from results));
update result_link_jobs set last_manual_at=null;
select pg_temp.as_user('71111111-1111-4111-8111-111111111111',$$select retry_my_link_revocation('74444444-4444-4444-8444-444444444444')$$);
select claim_link_revocation() as claimed \gset
select (:'claimed'::jsonb->>'token') as token \gset
-- Simulated clock advancement in test metadata only; never in production worker.
update result_link_objects set removed_at=clock_timestamp()-interval '66 seconds';
select record_link_object(:'jid',:'token',id,'cdn_verified',null,null,404) from result_link_objects where asset='file';
select finish_link_revocation(:'jid',:'token','CDN_ACCESSIBLE');
select pg_temp.check_that('one blocked object never confirms whole result',(select status<>'confirmed' from result_link_jobs));
update result_link_jobs set last_manual_at=null;
select pg_temp.as_user('71111111-1111-4111-8111-111111111111',$$select retry_my_link_revocation('74444444-4444-4444-8444-444444444444')$$);
select claim_link_revocation() as claimed \gset
select (:'claimed'::jsonb->>'token') as token \gset
select record_link_object(:'jid',:'token',id,'cdn_verified',null,null,403) from result_link_objects where asset='thumb';
select finish_link_revocation(:'jid',:'token','OK');
select pg_temp.check_that('all objects required for confirmation',(select status='confirmed' and next_attempt_at is null from result_link_jobs));
select set_config('request.jwt.claims','{"sub":"71111111-1111-4111-8111-111111111111"}',true);
select pg_temp.check_that('legacy warning cleared only after both CDN probes',not exists(select 1 from my_legacy_link_risks()));
select set_config('request.jwt.claims','{}',true);
select pg_temp.check_that('minimal attempt history retained',(select count(*)=9 from result_link_attempts) and not exists(select 1 from result_link_attempts where finished_at is null));
-- An interrupted sixth automatic attempt must become exhausted, not run forever.
insert into results(id,project_id,owner_id,kind,ratio,output,file_path,thumb_path,legacy_links_unverified)
 values('79999999-9999-4999-8999-999999999999','73333333-3333-4333-8333-333333333333','71111111-1111-4111-8111-111111111111','single','1:1','jpeg',
 '71111111-1111-4111-8111-111111111111/73333333-3333-4333-8333-333333333333/results/79999999-9999-4999-8999-999999999999.jpg',
 '71111111-1111-4111-8111-111111111111/73333333-3333-4333-8333-333333333333/results/79999999-9999-4999-8999-999999999999_t.jpg',true);
update result_link_jobs set auto_attempts=6,status='retrying',lease_token=gen_random_uuid(),lease_until=clock_timestamp()-interval '1 second' where result_id='79999999-9999-4999-8999-999999999999';
select pg_temp.check_that('expired sixth lease never creates a seventh attempt',claim_link_revocation() is null);
select pg_temp.check_that('expired sixth lease persisted as exhausted',(select status='failed_exhausted' and last_code='LEASE_EXPIRED' and lease_token is null from result_link_jobs where result_id='79999999-9999-4999-8999-999999999999'));
select label,ok from checks order by label;
select count(*) total,count(*) filter(where ok) passed from checks;
do $$begin if exists(select 1 from checks where ok is distinct from true)then raise exception 'Link revocation regression failed';end if;end $$;
rollback;
