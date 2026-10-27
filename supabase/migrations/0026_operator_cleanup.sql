-- PROJ-041..068. No operator is provisioned by this migration. Previous
-- migrations/policies remain immutable; legal/CDN gates are never bypassed.
create table cleanup_operators (
 user_id uuid primary key references profiles(id) on delete cascade,
 role text not null check(role in('viewer','executor')),generation uuid not null default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
create function rotate_cleanup_operator_generation() returns trigger language plpgsql as $$begin
 if (NEW.role,NEW.deleted_at) is distinct from (OLD.role,OLD.deleted_at) then NEW.generation:=gen_random_uuid();else NEW.generation:=OLD.generation;end if;
 NEW.updated_at:=clock_timestamp();return NEW;end $$;
create trigger cleanup_operator_generation before update on cleanup_operators for each row execute function rotate_cleanup_operator_generation();
alter table result_cleanup_objects add column manual_attempts int not null default 0 check(manual_attempts>=0);
alter table result_cleanup_jobs add column active_manual_run uuid;
create table result_cleanup_runs (
 id uuid primary key default gen_random_uuid(),cleanup_job_id uuid not null references result_cleanup_jobs(id) on delete cascade,
 result_id uuid not null references results(id) on delete cascade,actor_id uuid not null,actor_generation uuid not null,review_version bigint not null,
 request_id uuid not null unique,preview_id uuid not null,state jsonb not null,
 status_version bigint not null default 1 check(status_version between 1 and 9223372036854775807),version_xid bigint not null default txid_current(),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
create unique index cleanup_one_active_manual_run on result_cleanup_runs(cleanup_job_id) where state->>'status' in('queued','processing');
alter table result_cleanup_jobs add foreign key(active_manual_run) references result_cleanup_runs(id) on delete set null;
create table cleanup_operator_previews (
 id uuid primary key default gen_random_uuid(),result_id uuid not null,actor_id uuid not null,actor_generation uuid not null,snapshot jsonb not null,
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',consumed_by uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
create table cleanup_operator_audit (
 id uuid primary key default gen_random_uuid(),actor_id uuid,result_id uuid,run_id uuid,object_id uuid,
 code text not null check(code ~ '^[A-Z][A-Z0-9_]{0,60}$'),status_version bigint,error_id uuid unique,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
do $$declare t text;begin
 foreach t in array array['cleanup_operators','result_cleanup_runs','cleanup_operator_previews','cleanup_operator_audit'] loop
  execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);execute format('grant all on %I to service_role',t);
 end loop;
end $$;
revoke update,delete on cleanup_operator_audit from service_role;

create function operator_utc(t timestamptz) returns text language sql immutable as $$select to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')$$;
create function cleanup_operator_role(uid uuid) returns text language sql stable security definer set search_path=public as $$
 select a.role from cleanup_operators a join profiles p on p.id=a.user_id where a.user_id=uid and a.deleted_at is null and p.deleted_at is null and p.deletion_requested_at is null;
$$;
create function operator_cleanup_access() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('allowed',cleanup_operator_role(auth.uid()) is not null,'can_execute',coalesce(cleanup_operator_role(auth.uid())='executor',false));
$$;
revoke all on function cleanup_operator_role(uuid) from public,anon,authenticated;
revoke all on function operator_cleanup_access() from public,anon;
grant execute on function operator_cleanup_access() to authenticated;

-- One version per state-changing transaction, including several object changes.
-- A read never allocates a version. BIGINT is always serialized as a string.
create function guard_manual_cleanup_version() returns trigger language plpgsql as $$begin
 if TG_OP='INSERT' then
  if NEW.status_version<>1 then raise exception 'Manual cleanup version must start at one' using errcode='23514';end if;
  NEW.version_xid:=txid_current();return NEW;
 end if;
 if (NEW.id,NEW.cleanup_job_id,NEW.result_id,NEW.actor_id,NEW.actor_generation,NEW.review_version,NEW.request_id,NEW.preview_id,NEW.created_at) is distinct from
    (OLD.id,OLD.cleanup_job_id,OLD.result_id,OLD.actor_id,OLD.actor_generation,OLD.review_version,OLD.request_id,OLD.preview_id,OLD.created_at) then raise exception 'Manual cleanup identity is immutable' using errcode='23514';end if;
 if NEW.status_version<>OLD.status_version or NEW.version_xid<>OLD.version_xid then raise exception 'Manual cleanup version is server managed' using errcode='23514';end if;
 if NEW.state is distinct from OLD.state then
  if OLD.version_xid<>txid_current() then
   if OLD.status_version=9223372036854775807 then raise exception 'Manual cleanup version limit' using errcode='22003';end if;
   NEW.status_version:=OLD.status_version+1;NEW.version_xid:=txid_current();
  end if;
  NEW.updated_at:=clock_timestamp();
 end if;return NEW;
end $$;
create trigger manual_cleanup_version before insert or update on result_cleanup_runs for each row execute function guard_manual_cleanup_version();

create function manual_cleanup_reason(rid uuid) returns text language plpgsql stable security definer set search_path=public as $$
declare j result_cleanup_jobs;reason text;
begin
 reason:=result_cleanup_gate(rid);if reason<>'READY' then return reason;end if;
 select * into j from result_cleanup_jobs where result_id=rid;
 if j.id is null then return 'NO_CLEANUP_JOB';end if;
 if exists(select 1 from result_cleanup_runs where result_id=rid and status_version>=9223372036854775806) then return 'VERSION_LIMIT';end if;
 if j.active_manual_run is not null or j.lease_token is not null then return 'BUSY';end if;
 if not exists(select 1 from result_cleanup_objects where job_id=j.id and status<>'confirmed') then return 'NO_PENDING_OBJECTS';end if;
 if j.title_status not in('confirmed','failed_exhausted') or exists(select 1 from result_cleanup_objects where job_id=j.id and status<>'confirmed' and (status<>'failed_exhausted' or auto_attempts<>6 or next_attempt_at is not null)) then return 'AUTOMATIC_PENDING';end if;
 return 'READY';
end $$;
create function manual_confirmation_state(rid uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('result_id',r.id,'owner_id',r.owner_id,'project_id',r.project_id,'deleted_at',r.deleted_at,'epoch',r.media_epoch,
 'gate',manual_cleanup_reason(rid),'job',jsonb_build_object('status',j.status,'title_status',j.title_status,'title_attempts',j.title_attempts,'title_next_at',j.title_next_at,'active_manual_run',j.active_manual_run,'busy',j.lease_token is not null,'lease_until',j.lease_until,'updated_at',j.updated_at),'review_version',(select version from result_retention_reviews where result_id=rid and deleted_at is null),
 'link',(select jsonb_build_object('status',l.status,'updated_at',l.updated_at) from result_link_jobs l where l.result_id=rid),
 'objects',(select jsonb_agg(jsonb_build_object('id',o.id,'asset',o.asset,'location',o.location,'path_checksum',md5(o.path),'status',o.status,'auto_attempts',o.auto_attempts,'manual_attempts',o.manual_attempts,'code',o.last_code,'last_failure_at',o.last_failure_at,'verified_at',o.verified_at,'updated_at',o.updated_at) order by o.location,o.asset,o.id) from result_cleanup_objects o where o.job_id=j.id))
 from results r join result_cleanup_jobs j on j.result_id=r.id where r.id=rid;
$$;
-- Mutation rejections return normally so the minimal denial audit commits.
create function manual_cleanup_denied(rid uuid,code text) returns jsonb language plpgsql security definer set search_path=public as $$declare eid uuid:=gen_random_uuid();begin
 insert into cleanup_operator_audit(actor_id,result_id,code,error_id)values(auth.uid(),rid,code,eid);
 return jsonb_build_object('ok',false,'reason',code,'error_id',eid);end $$;
-- Independent display evidence: a retention hold must never imply link proof.
create function operator_cleanup_links_confirmed(rid uuid) returns boolean language plpgsql stable security definer set search_path=public as $$
declare r results;l result_link_jobs;o result_link_objects;expected text;
begin
 select * into r from results where id=rid;if r.id is null or r.deleted_at is null then return false;end if;
 select * into l from result_link_jobs where result_id=rid;
 if l.id is null then return not r.legacy_links_unverified;end if;
 if l.status<>'confirmed' or (select count(*) from result_link_objects where job_id=l.id and cdn_verified_at is not null and removed_at is not null and activated_at is not null)<>2 then return false;end if;
 expected:=r.owner_id::text||'/'||r.project_id::text||'/results/'||r.id::text;
 for o in select * from result_link_objects where job_id=l.id loop
  if o.source_path<>(case when o.asset='file' then r.file_path else r.thumb_path end) or o.target_path<>expected||'/revoked/'||l.id::text||(case when o.asset='thumb' then '/thumb.jpg' when r.output='mp4' then '/file.mp4' else '/file.jpg' end) or exists(select 1 from storage.objects where bucket_id='photos' and name=o.source_path) then return false;end if;
 end loop;return true;
end $$;
revoke all on function operator_cleanup_links_confirmed(uuid) from public,anon,authenticated,service_role;
create function preview_manual_result_cleanup(rid uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare j result_cleanup_jobs;reason text;pid uuid;gen uuid;objs jsonb;
begin
 if cleanup_operator_role(auth.uid()) is null then return manual_cleanup_denied(rid,'OPERATOR_REQUIRED');end if;
 perform 1 from results where id=rid for share;select * into j from result_cleanup_jobs where result_id=rid for share;
 if j.id is null then return manual_cleanup_denied(rid,'NOT_FOUND');end if;
 reason:=manual_cleanup_reason(rid);
 select generation into gen from cleanup_operators where user_id=auth.uid() and deleted_at is null for share;
 if gen is null or cleanup_operator_role(auth.uid()) is null then return manual_cleanup_denied(rid,'OPERATOR_REVOKED');end if;
 if cleanup_operator_role(auth.uid())<>'executor' then reason:='EXECUTOR_REQUIRED';end if;
 select jsonb_agg(jsonb_build_object('id',o.id,'asset',o.asset,'location',o.location,'status',o.status,'auto_attempts',o.auto_attempts,'manual_attempts',o.manual_attempts,'code',o.last_code,'last_failure_at',operator_utc(o.last_failure_at)) order by o.location,o.asset,o.id) into objs from result_cleanup_objects o where o.job_id=j.id and o.status<>'confirmed';
 insert into cleanup_operator_previews(result_id,actor_id,actor_generation,snapshot)values(rid,auth.uid(),gen,manual_confirmation_state(rid))returning id into pid;
 return jsonb_build_object('ok',true,'preview_id',pid,'result_id',rid,'kind',(select kind from results where id=rid),'output',(select output from results where id=rid),
 'deleted',true,'links_confirmed',operator_cleanup_links_confirmed(rid),'retention',(select decision from result_retention_reviews where result_id=rid and deleted_at is null),
 'eligible',reason='READY','reason',reason,'remaining',coalesce(jsonb_array_length(objs),0),'objects',coalesce(objs,'[]'::jsonb),'checked_at',operator_utc(clock_timestamp()));
end $$;
create function request_manual_result_cleanup(rid uuid,preview_id uuid,request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare j result_cleanup_jobs;p cleanup_operator_previews;a cleanup_operators;existing result_cleanup_runs;runid uuid:=gen_random_uuid();reason text;objs jsonb;rv bigint;
begin
 if cleanup_operator_role(auth.uid())<>'executor' or cleanup_operator_role(auth.uid()) is null then return manual_cleanup_denied(rid,'EXECUTOR_REQUIRED');end if;
 -- Shared result -> review -> cleanup job -> run -> grant lock order.
 perform 1 from results where id=rid for update;
 perform 1 from result_retention_reviews where result_id=rid for share;
 select * into j from result_cleanup_jobs where result_id=rid for update;
 select * into a from cleanup_operators where user_id=auth.uid() for update;
 if a.user_id is null or a.deleted_at is not null or cleanup_operator_role(auth.uid()) is distinct from 'executor' then return manual_cleanup_denied(rid,'OPERATOR_REVOKED');end if;
 select * into existing from result_cleanup_runs where result_cleanup_runs.request_id=request_manual_result_cleanup.request_id;
 if existing.id is not null then
  if existing.actor_id=auth.uid() and existing.result_id=rid and existing.preview_id=request_manual_result_cleanup.preview_id then return jsonb_build_object('ok',true,'job_id',existing.id,'replayed',true);end if;
  return manual_cleanup_denied(rid,'REPLAY_MISMATCH');
 end if;
 reason:=manual_cleanup_reason(rid);if reason<>'READY' then return manual_cleanup_denied(rid,reason);end if;
 select * into p from cleanup_operator_previews where id=request_manual_result_cleanup.preview_id for update;
 if p.id is null or p.actor_id<>auth.uid() or p.result_id<>rid or p.actor_generation<>a.generation or p.expires_at<=clock_timestamp() or p.deleted_at is not null or p.consumed_by is not null then return manual_cleanup_denied(rid,'PREVIEW_EXPIRED');end if;
 if p.snapshot is distinct from manual_confirmation_state(rid) then return manual_cleanup_denied(rid,'SELECTION_CHANGED');end if;
 -- Technical request abuse protection, independent of cleanup attempt counters.
 if (select count(*) from result_cleanup_runs where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=5 then return manual_cleanup_denied(rid,'RATE_LIMITED');end if;
 select version into rv from result_retention_reviews where result_id=rid and deleted_at is null;
 select jsonb_agg(jsonb_build_object('id',o.id,'asset',o.asset,'location',o.location,'target',o.status<>'confirmed','status',case when o.status='confirmed' then 'confirmed' else 'pending' end,
 'auto_attempts',o.auto_attempts,'manual_attempts',o.manual_attempts,'code',null,'verified_at',operator_utc(o.verified_at)) order by o.location,o.asset,o.id) into objs from result_cleanup_objects o where o.job_id=j.id;
 insert into result_cleanup_runs(id,cleanup_job_id,result_id,actor_id,actor_generation,review_version,request_id,preview_id,state)
 values(runid,j.id,rid,auth.uid(),a.generation,rv,request_id,preview_id,jsonb_build_object('status','queued','reason','READY','cleanup_status',j.status,'title_status',j.title_status,'objects',objs,'can_retry',false));
 update result_cleanup_jobs set active_manual_run=runid where id=j.id;
 update cleanup_operator_previews set consumed_by=runid where id=p.id;
 insert into cleanup_operator_audit(actor_id,result_id,run_id,code,status_version)values(auth.uid(),rid,runid,'REQUESTED',1);
 return jsonb_build_object('ok',true,'job_id',runid,'replayed',false);
end $$;

create function manual_execution_reason(run result_cleanup_runs) returns text language plpgsql stable security definer set search_path=public as $$declare reason text;begin
 if run.deleted_at is not null then return 'RUN_INVALIDATED';end if;
 if not exists(select 1 from cleanup_operators where user_id=run.actor_id and role='executor' and deleted_at is null and generation=run.actor_generation) or cleanup_operator_role(run.actor_id) is distinct from 'executor' then return 'OPERATOR_REVOKED';end if;
 reason:=result_cleanup_gate(run.result_id);if reason<>'READY' then return reason;end if;
 if run.review_version is distinct from(select version from result_retention_reviews where result_id=run.result_id and deleted_at is null) then return 'REVIEW_CHANGED';end if;
 if run.status_version=9223372036854775807 then return 'VERSION_LIMIT';end if;
 return 'READY';end $$;

-- Public status is one stored state row from one read snapshot. Gates are checked
-- again by preview/worker, never silently recomputed into same-version state.
create function operator_cleanup_status(run_id uuid,request_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$declare run result_cleanup_runs;begin
 if cleanup_operator_role(auth.uid()) is null then raise exception '운영자 권한이 필요해요' using errcode='42501';end if;
 select * into run from result_cleanup_runs where id=run_id and deleted_at is null;
 if run.id is null then raise exception '작업을 찾을 수 없어요' using errcode='P0002';end if;
 return run.state||jsonb_build_object('job_id',run.id,'result_id',run.result_id,'status_version',run.status_version::text,'checked_at',operator_utc(statement_timestamp()),'request_id',request_id,
 'integrity_code',case when run.status_version=9223372036854775807 then 'VERSION_LIMIT' else null end);
end $$;
create function operator_cleanup_cases() returns table(result_id uuid,kind text,output text,deleted_at timestamptz,remaining bigint,reason text,latest_run_id uuid)
language plpgsql stable security definer set search_path=public as $$begin
 if cleanup_operator_role(auth.uid()) is null then raise exception '운영자 권한이 필요해요' using errcode='42501';end if;
 return query select r.id,r.kind,r.output,r.deleted_at,(select count(*) from result_cleanup_objects o where o.job_id=j.id and o.status<>'confirmed'),manual_cleanup_reason(r.id),
 (select x.id from result_cleanup_runs x where x.result_id=r.id order by x.created_at desc,x.id desc limit 1)
 from results r join result_cleanup_jobs j on j.result_id=r.id where r.deleted_at is not null and (j.active_manual_run is not null or exists(select 1 from result_cleanup_objects o where o.job_id=j.id and o.status='failed_exhausted') or exists(select 1 from result_cleanup_runs x where x.result_id=r.id)) order by j.created_at desc,r.id;
end $$;
create function operator_cleanup_audit(run_id uuid) returns table(id uuid,actor_id uuid,object_id uuid,code text,status_version text,error_id uuid,created_at text)
language plpgsql stable security definer set search_path=public as $$begin
 if cleanup_operator_role(auth.uid()) is null then raise exception '운영자 권한이 필요해요' using errcode='42501';end if;
 return query select a.id,a.actor_id,a.object_id,a.code,a.status_version::text,a.error_id,operator_utc(a.created_at) from cleanup_operator_audit a where a.run_id=operator_cleanup_audit.run_id order by a.created_at,a.id;
end $$;
create function report_cleanup_snapshot_issue(run_id uuid,error_id uuid,version text,checked_at timestamptz) returns void language plpgsql security definer set search_path=public as $$begin
 if cleanup_operator_role(auth.uid()) is null then raise exception '운영자 권한이 필요해요' using errcode='42501';end if;
 if not exists(select 1 from result_cleanup_runs where id=run_id) then return;end if;
 insert into cleanup_operator_audit(actor_id,run_id,code,error_id,status_version)values(auth.uid(),run_id,'SNAPSHOT_INTEGRITY',error_id,case when version ~ '^[1-9][0-9]{0,18}$' and version::numeric<=9223372036854775807 then version::bigint else null end)on conflict on constraint cleanup_operator_audit_error_id_key do nothing;
end $$;

create function manual_object_state(state jsonb,oid uuid,new_status text,code text) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_agg(case when x->>'id'=oid::text then x||jsonb_build_object('status',new_status,'code',code,'manual_attempts',o.manual_attempts,'verified_at',operator_utc(o.verified_at)) else x end order by ord)
 from jsonb_array_elements(state->'objects')with ordinality a(x,ord) left join result_cleanup_objects o on o.id=oid;
$$;
create function stop_manual_cleanup(jid uuid,reason text) returns void language plpgsql security definer set search_path=public as $$
declare j result_cleanup_jobs;run result_cleanup_runs;objs jsonb;v bigint;
begin
 select * into j from result_cleanup_jobs where id=jid for update;select * into run from result_cleanup_runs where id=j.active_manual_run for update;
 if run.id is null then return;end if;
 if run.status_version=9223372036854775807 then
  insert into cleanup_operator_audit(actor_id,result_id,run_id,code,status_version,error_id)values(run.actor_id,run.result_id,run.id,'VERSION_LIMIT',run.status_version,run.id)on conflict on constraint cleanup_operator_audit_error_id_key do nothing;return;
 end if;
 select jsonb_agg(case when x->>'status' in('pending','processing') then x||jsonb_build_object('status','blocked','code',reason) else x end order by ord) into objs from jsonb_array_elements(run.state->'objects')with ordinality a(x,ord);
 update result_cleanup_objects set status='failed_exhausted',active_token=null,next_attempt_at=null,last_code=reason where job_id=j.id and active_token=j.lease_token;
 update result_cleanup_jobs set active_manual_run=null,lease_token=null,lease_until=null,status='failed_exhausted',updated_at=clock_timestamp() where id=j.id;
 update result_cleanup_runs set state=state||jsonb_build_object('status',case when exists(select 1 from jsonb_array_elements(objs) x where (x->>'target')::boolean and x->>'status'='confirmed') then 'partial' when exists(select 1 from jsonb_array_elements(objs) x where (x->>'target')::boolean and x->>'status'='failed') then 'failed' else 'blocked' end,
 'objects',objs,'reason',reason,'cleanup_status','failed_exhausted','can_retry',false)where id=run.id returning status_version into v;
 insert into cleanup_operator_audit(actor_id,result_id,run_id,code,status_version)values(run.actor_id,run.result_id,run.id,reason,v);
end $$;

create function complete_manual_cleanup(jid uuid,token uuid,outcome text,expired boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare j result_cleanup_jobs;run result_cleanup_runs;o result_cleanup_objects;reason text;objs jsonb;new_status text;whole_status text;v bigint;absent boolean;
begin
 select * into j from result_cleanup_jobs where id=jid;
 perform 1 from results where id=j.result_id for share;
 perform 1 from result_retention_reviews where result_id=j.result_id for share;
 select * into j from result_cleanup_jobs where id=jid for update;
 select * into run from result_cleanup_runs where id=j.active_manual_run for update;
 perform 1 from cleanup_operators where user_id=run.actor_id for share;
 if run.id is null or j.lease_token is distinct from token or (not expired and j.lease_until<=clock_timestamp()) then raise exception '정리 작업 임대가 만료됐어요' using errcode='42501';end if;
 if run.status_version=9223372036854775807 then raise exception 'Manual cleanup version limit' using errcode='22003';end if;
 select * into o from result_cleanup_objects where job_id=jid and active_token=token for update;
 if o.id is null then raise exception '정리 객체가 바뀌었어요' using errcode='42501';end if;
 reason:=manual_execution_reason(run);
 if reason<>'READY' then perform stop_manual_cleanup(jid,reason);return;end if;
 absent:=not exists(select 1 from storage.objects where bucket_id='photos' and name=o.path);
 if outcome='ABSENT' and absent and not expired then
  update result_cleanup_objects set status='confirmed',verified_at=clock_timestamp(),active_token=null,next_attempt_at=null,last_code='ABSENT_CONFIRMED',updated_at=clock_timestamp()where id=o.id;
  reason:='ABSENT_CONFIRMED';objs:=manual_object_state(run.state,o.id,'confirmed',reason);
 else
  reason:=case when expired then 'LEASE_EXPIRED' when outcome in('STORAGE_ERROR','NETWORK_ERROR','OBJECT_PRESENT','VERIFY_FAILED') then outcome else 'VERIFY_FAILED' end;
  update result_cleanup_objects set status='failed_exhausted',active_token=null,next_attempt_at=null,last_code=reason,last_failure_at=clock_timestamp(),updated_at=clock_timestamp()where id=o.id;
  objs:=manual_object_state(run.state,o.id,'failed',reason);
 end if;
 new_status:=case when exists(select 1 from jsonb_array_elements(objs) x where x->>'status' in('pending','processing')) then 'processing'
  when not exists(select 1 from jsonb_array_elements(objs) x where (x->>'target')::boolean and x->>'status'<>'confirmed') then 'succeeded'
  when exists(select 1 from jsonb_array_elements(objs) x where (x->>'target')::boolean and x->>'status'='confirmed') then 'partial' else 'failed' end;
 whole_status:=case when j.title_status='confirmed' and not exists(select 1 from result_cleanup_objects where job_id=jid and status<>'confirmed') then 'confirmed' else 'failed_exhausted' end;
 update result_cleanup_jobs set lease_token=null,lease_until=null,active_manual_run=case when new_status='processing' then run.id else null end,status=whole_status,updated_at=clock_timestamp()where id=jid;
 update result_cleanup_runs set state=state||jsonb_build_object('status',new_status,'objects',objs,'reason',reason,'cleanup_status',whole_status,'can_retry',new_status in('partial','failed'))where id=run.id returning status_version into v;
 insert into cleanup_operator_audit(actor_id,result_id,run_id,object_id,code,status_version)values(run.actor_id,run.result_id,run.id,o.id,reason,v);
end $$;

alter function cleanup_snapshot(uuid,uuid) rename to cleanup_snapshot_0025;
create function cleanup_snapshot(jid uuid,token uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare snap jsonb;run result_cleanup_runs;reason text;
begin
 snap:=cleanup_snapshot_0025(jid,token);
 select x.* into run from result_cleanup_runs x join result_cleanup_jobs j on j.active_manual_run=x.id where j.id=jid for share of x;
 if run.id is null then return snap;end if;
 perform 1 from cleanup_operators where user_id=run.actor_id for share;
 reason:=manual_execution_reason(run);
 if reason='READY' and not exists(select 1 from jsonb_array_elements(run.state->'objects') x where x->>'id'=snap->'object'->>'id' and (x->>'target')::boolean and x->>'status'='processing') then reason:='SELECTION_CHANGED';end if;
 return snap||jsonb_build_object('eligible',(snap->>'eligible')::boolean and reason='READY','reason',case when not(snap->>'eligible')::boolean then snap->>'reason' else reason end);
end $$;
alter function finish_result_cleanup(uuid,uuid,text) rename to finish_result_cleanup_0025;
create or replace function finish_result_cleanup_0025(jid uuid,token uuid,outcome text) returns void language plpgsql security definer set search_path=public as $$
declare snap jsonb;j result_cleanup_jobs;o result_cleanup_objects;reason text;is_absent boolean;
begin
 snap:=cleanup_snapshot(jid,token);reason:=snap->>'reason';
 select * into j from result_cleanup_jobs where id=jid;
 select * into o from result_cleanup_objects where job_id=jid and active_token=token for update;
 if o.id is null then raise exception '정리 객체가 바뀌었어요' using errcode='42501';end if;
 is_absent:=not exists(select 1 from storage.objects where bucket_id='photos' and name=o.path);
 if reason<>'READY' then
  update result_cleanup_objects set status='pending',auto_attempts=greatest(auto_attempts-1,0),active_token=null,last_code=reason where id=o.id;
 elsif outcome='ABSENT' and is_absent then
  update result_cleanup_objects set status='confirmed',verified_at=clock_timestamp(),next_attempt_at=null,active_token=null,last_code='ABSENT_CONFIRMED',updated_at=clock_timestamp() where id=o.id;
 else
  update result_cleanup_objects set status=case when auto_attempts>=6 then 'failed_exhausted' else 'failed' end,
   next_attempt_at=case when auto_attempts>=6 then null else clock_timestamp()+make_interval(secs=>case auto_attempts when 1 then 60 when 2 then 300 when 3 then 900 when 4 then 3600 else 10800 end) end,
   last_failure_at=clock_timestamp(),last_code=case when outcome in('STORAGE_ERROR','NETWORK_ERROR','OBJECT_PRESENT','VERIFY_FAILED') then outcome else 'VERIFY_FAILED' end,active_token=null,updated_at=clock_timestamp() where id=o.id;
 end if;
 update result_cleanup_attempts set code=case when reason<>'READY' then reason when outcome='ABSENT' and is_absent then 'ABSENT_CONFIRMED' else 'DELETE_OR_VERIFY_FAILED' end,finished_at=clock_timestamp(),updated_at=clock_timestamp() where result_cleanup_attempts.token=finish_result_cleanup_0025.token;
 update result_cleanup_jobs set lease_token=null,lease_until=null,
 status=case when reason<>'READY' then 'blocked'
  when title_status='confirmed' and not exists(select 1 from result_cleanup_objects where job_id=jid and status<>'confirmed') then 'confirmed'
  when exists(select 1 from result_cleanup_objects where job_id=jid and status='failed_exhausted') or title_status='failed_exhausted' then 'failed_exhausted' else 'partial' end,
 updated_at=clock_timestamp() where id=jid;
end $$;
create function finish_result_cleanup(jid uuid,token uuid,outcome text) returns void language plpgsql security definer set search_path=public as $$begin
 if exists(select 1 from result_cleanup_jobs where id=jid and active_manual_run is not null) then perform complete_manual_cleanup(jid,token,outcome);else perform finish_result_cleanup_0025(jid,token,outcome);end if;
end $$;

-- Additional fence inside the actual Storage transaction. It complements, and
-- never replaces, the existing owner/path/reference/retention/CDN checks.
create function guard_manual_storage_delete() returns trigger language plpgsql security definer set search_path=public as $$
declare run result_cleanup_runs;j result_cleanup_jobs;
begin
 if OLD.bucket_id<>'photos' then return OLD;end if;
 if exists(select 1 from profiles p join account_deletion_jobs a on a.owner_id=p.id where p.id::text=split_part(OLD.name,'/',1) and p.deletion_requested_at is not null and a.status='processing' and a.lease_until>clock_timestamp()) then return OLD;end if;
 select q.* into j from result_cleanup_jobs q join result_cleanup_objects o on o.job_id=q.id where o.path=OLD.name and q.active_manual_run is not null for share of q;
 if j.id is null then return OLD;end if;
 select * into run from result_cleanup_runs where id=j.active_manual_run for share;
 perform 1 from cleanup_operators where user_id=run.actor_id for share;
 if manual_execution_reason(run)<>'READY' then raise exception '운영자 재처리 조건이 바뀌었어요' using errcode='42501';end if;
 if not exists(select 1 from result_cleanup_objects o join jsonb_array_elements(run.state->'objects') x on x->>'id'=o.id::text where o.job_id=j.id and o.path=OLD.name and o.active_token=j.lease_token and (x->>'target')::boolean and x->>'status'='processing')then raise exception '운영자 재처리 대상이 달라요' using errcode='42501';end if;
 return OLD;
end $$;
create trigger manual_cleanup_storage_fence before delete on storage.objects for each row execute function guard_manual_storage_delete();

-- Same automatic behavior; manual leases are recovered in their own domain.
create function claim_automatic_result_cleanup() returns jsonb language plpgsql security definer set search_path=public as $$
declare j result_cleanup_jobs;r results;review result_retention_reviews;o result_cleanup_objects;token uuid:=gen_random_uuid(); n int;reason text;
begin
 -- Lock the result first, including during lease recovery. A changed legal
 -- decision is a wait condition, never a counted deletion failure.
 for r in select rr.* from results rr where exists(select 1 from result_cleanup_jobs q where q.result_id=rr.id and q.active_manual_run is null and q.lease_until<=clock_timestamp()) for update skip locked loop
  select * into j from result_cleanup_jobs where result_id=r.id and active_manual_run is null and lease_until<=clock_timestamp() for update skip locked;
  if j.id is null then continue;end if;
  select * into review from result_retention_reviews where result_id=r.id for share;
  reason:=result_cleanup_gate(r.id);
  if reason='READY' and review.version is distinct from j.review_version then reason:='REVIEW_CHANGED';end if;
  update result_cleanup_attempts set code=case when reason='READY' then 'LEASE_EXPIRED' else reason end,finished_at=clock_timestamp(),updated_at=clock_timestamp() where job_id=j.id and finished_at is null;
  update result_cleanup_objects set
   status=case when reason<>'READY' then 'pending' when auto_attempts>=6 then 'failed_exhausted' else 'failed' end,
   auto_attempts=case when reason<>'READY' then greatest(auto_attempts-1,0) else auto_attempts end,
   last_code=case when reason='READY' then 'LEASE_EXPIRED' else reason end,
   last_failure_at=case when reason='READY' then clock_timestamp() else last_failure_at end,active_token=null,
   next_attempt_at=case when reason<>'READY' then clock_timestamp() when auto_attempts>=6 then null else clock_timestamp()+make_interval(secs=>case greatest(auto_attempts,1) when 1 then 60 when 2 then 300 when 3 then 900 when 4 then 3600 else 10800 end) end
   where job_id=j.id and active_token=j.lease_token;
  update result_cleanup_jobs set lease_token=null,lease_until=null,status=case when reason<>'READY' then 'blocked' when exists(select 1 from result_cleanup_objects where job_id=j.id and status='failed_exhausted') then 'failed_exhausted' else 'partial' end,updated_at=clock_timestamp() where id=j.id;
 end loop;
 select q.* into j from result_cleanup_jobs q join results rr on rr.id=q.result_id
 where q.active_manual_run is null and rr.deleted_at is not null and q.status<>'confirmed' and q.lease_token is null and result_cleanup_gate(rr.id)='READY'
 and ((q.title_status not in('confirmed','failed_exhausted') and q.title_next_at<=clock_timestamp()) or exists(select 1 from result_cleanup_objects x where x.job_id=q.id and x.status not in('confirmed','failed_exhausted') and x.next_attempt_at<=clock_timestamp()))
 order by q.created_at for update of rr,q skip locked limit 1;
 if j.id is null then return null;end if;
 select * into r from results where id=j.result_id;
 select * into review from result_retention_reviews where result_id=r.id for share;
 -- Capture replacement paths only from the confirmed server manifest.
 insert into result_cleanup_objects(job_id,asset,location,path)
 select j.id,x.asset,'rotated',x.target_path from result_link_objects x join result_link_jobs l on l.id=x.job_id where l.result_id=r.id and l.status='confirmed'
 on conflict(job_id,path)do nothing;
 update result_cleanup_jobs set status='processing',review_version=review.version,lease_token=token,lease_until=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp() where id=j.id;
 if j.title_status not in('confirmed','failed_exhausted') and j.title_next_at<=clock_timestamp() then
  begin
   update results set project_name_snapshot=null,display_title_override=null,titles_purged_at=clock_timestamp() where id=r.id and titles_purged_at is null;
   if not exists(select 1 from results where id=r.id and project_name_snapshot is null and display_title_override is null and titles_purged_at is not null) then raise exception 'Title absence not verified';end if;
   update result_cleanup_jobs set title_status='confirmed',title_verified_at=clock_timestamp(),title_next_at=null,title_code='TITLES_PURGED' where id=j.id;
   insert into result_cleanup_attempts(job_id,token,task,attempt_no,code,finished_at)values(j.id,gen_random_uuid(),'titles',j.title_attempts+1,'TITLES_PURGED',clock_timestamp());
  exception when others then
   n:=j.title_attempts+1;
   insert into result_cleanup_attempts(job_id,token,task,attempt_no,code,finished_at)values(j.id,gen_random_uuid(),'titles',n,'TITLE_PURGE_FAILED',clock_timestamp());
   update result_cleanup_jobs set title_attempts=n,title_status=case when n>=6 then 'failed_exhausted' else 'failed' end,title_code='TITLE_PURGE_FAILED',
    title_next_at=case when n>=6 then null else clock_timestamp()+make_interval(secs=>case n when 1 then 60 when 2 then 300 when 3 then 900 when 4 then 3600 else 10800 end) end where id=j.id;
  end;
 end if;
 select * into o from result_cleanup_objects where job_id=j.id and status not in('confirmed','failed_exhausted') and next_attempt_at<=clock_timestamp() order by location,asset for update skip locked limit 1;
 if o.id is null then
  update result_cleanup_jobs set lease_token=null,lease_until=null,status=case when title_status='confirmed' and not exists(select 1 from result_cleanup_objects where job_id=j.id and status<>'confirmed') then 'confirmed' else 'partial' end where id=j.id;
  return jsonb_build_object('processed_titles',true);
 end if;
 update result_cleanup_objects set status='processing',auto_attempts=auto_attempts+1,active_token=token,updated_at=clock_timestamp() where id=o.id;
 insert into result_cleanup_attempts(job_id,object_id,token,attempt_no,scheduled_at,schedule_delay_ms)values(j.id,o.id,token,o.auto_attempts+1,o.next_attempt_at,greatest(0,floor(extract(epoch from clock_timestamp()-o.next_attempt_at)*1000)::bigint));
 return cleanup_snapshot(j.id,token);
end $$;

create or replace function claim_result_cleanup() returns jsonb language plpgsql security definer set search_path=public as $$
declare r results;j result_cleanup_jobs;run result_cleanup_runs;o result_cleanup_objects;oid uuid;reason text;token uuid:=gen_random_uuid();objs jsonb;v bigint;
begin
 -- Recover at most one expired manual lease; never spend/reset auto counters.
 select rr.* into r from results rr where exists(select 1 from result_cleanup_jobs q join result_cleanup_runs x on x.id=q.active_manual_run where q.result_id=rr.id and q.lease_until<=clock_timestamp() and x.status_version<9223372036854775807) for update skip locked limit 1;
 if r.id is not null then
  select * into j from result_cleanup_jobs where result_id=r.id for update;
  perform complete_manual_cleanup(j.id,j.lease_token,'NETWORK_ERROR',true);
 end if;
 select rr.* into r from results rr where exists(select 1 from result_cleanup_jobs q join result_cleanup_runs x on x.id=q.active_manual_run where q.result_id=rr.id and q.lease_token is null and x.state->>'status' in('queued','processing') and x.status_version<9223372036854775807) order by rr.id for update skip locked limit 1;
 if r.id is null then return claim_automatic_result_cleanup();end if;
 perform 1 from result_retention_reviews where result_id=r.id for share;
 select * into j from result_cleanup_jobs where result_id=r.id for update;
 select * into run from result_cleanup_runs where id=j.active_manual_run for update;
 perform 1 from cleanup_operators where user_id=run.actor_id for share;
 reason:=manual_execution_reason(run);
 if reason='READY' and run.status_version>=9223372036854775806 then reason:='VERSION_LIMIT';end if;
 if reason<>'READY' then perform stop_manual_cleanup(j.id,reason);return null;end if;
 select (x->>'id')::uuid into oid from jsonb_array_elements(run.state->'objects') x where (x->>'target')::boolean and x->>'status'='pending' limit 1;
 select * into o from result_cleanup_objects where id=oid and job_id=j.id and status='failed_exhausted' and auto_attempts=6 for update;
 if o.id is null then perform stop_manual_cleanup(j.id,'SELECTION_CHANGED');return null;end if;
 update result_cleanup_jobs set lease_token=token,lease_until=clock_timestamp()+interval '5 minutes',review_version=run.review_version,status='processing'where id=j.id;
 update result_cleanup_objects set status='processing',active_token=token,manual_attempts=manual_attempts+1,updated_at=clock_timestamp()where id=o.id;
 objs:=manual_object_state(run.state,o.id,'processing','PROCESSING');
 update result_cleanup_runs set state=state||jsonb_build_object('status','processing','objects',objs,'reason','READY','cleanup_status','processing','can_retry',false)where id=run.id returning status_version into v;
 insert into cleanup_operator_audit(actor_id,result_id,run_id,object_id,code,status_version)values(run.actor_id,run.result_id,run.id,o.id,'OBJECT_CLAIMED',v);
 return cleanup_snapshot(j.id,token);
end $$;
-- Internal helpers, old entry points and table internals are not user APIs.
revoke all on function manual_cleanup_reason(uuid),manual_confirmation_state(uuid),manual_cleanup_denied(uuid,text),manual_execution_reason(result_cleanup_runs),manual_object_state(jsonb,uuid,text,text),stop_manual_cleanup(uuid,text),complete_manual_cleanup(uuid,uuid,text,boolean),cleanup_snapshot_0025(uuid,uuid),finish_result_cleanup_0025(uuid,uuid,text),claim_automatic_result_cleanup() from public,anon,authenticated,service_role;
revoke all on function preview_manual_result_cleanup(uuid),request_manual_result_cleanup(uuid,uuid,uuid),operator_cleanup_status(uuid,uuid),operator_cleanup_cases(),operator_cleanup_audit(uuid),report_cleanup_snapshot_issue(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function preview_manual_result_cleanup(uuid),request_manual_result_cleanup(uuid,uuid,uuid),operator_cleanup_status(uuid,uuid),operator_cleanup_cases(),operator_cleanup_audit(uuid),report_cleanup_snapshot_issue(uuid,uuid,text,timestamptz) to authenticated;
revoke all on function cleanup_snapshot(uuid,uuid),finish_result_cleanup(uuid,uuid,text),claim_result_cleanup() from public,anon,authenticated;
grant execute on function cleanup_snapshot(uuid,uuid),finish_result_cleanup(uuid,uuid,text),claim_result_cleanup() to service_role;
notify pgrst,'reload schema';

create function operator_cleanup_automatic_audit(rid uuid) returns table(id uuid,object_id uuid,task text,attempt_no int,code text,started_at text,finished_at text)
language plpgsql stable security definer set search_path=public as $$begin
 if cleanup_operator_role(auth.uid()) is null then raise exception '운영자 권한이 필요해요' using errcode='42501';end if;
 return query select a.id,a.object_id,a.task,a.attempt_no,a.code,operator_utc(a.started_at),operator_utc(a.finished_at) from result_cleanup_attempts a join result_cleanup_jobs j on j.id=a.job_id where j.result_id=rid order by a.started_at,a.id;
end $$;
revoke all on function operator_cleanup_automatic_audit(uuid) from public,anon;
grant execute on function operator_cleanup_automatic_audit(uuid) to authenticated;
notify pgrst,'reload schema';

-- Includes durable preview/request denials, even before a run was created.
create function operator_cleanup_case_audit(rid uuid) returns table(id uuid,actor_id uuid,object_id uuid,code text,status_version text,error_id uuid,created_at text)
language plpgsql stable security definer set search_path=public as $$begin
 if cleanup_operator_role(auth.uid()) is null then raise exception '운영자 권한이 필요해요' using errcode='42501';end if;
 return query select a.id,a.actor_id,a.object_id,a.code,a.status_version::text,a.error_id,operator_utc(a.created_at) from cleanup_operator_audit a where a.result_id=rid or a.run_id in(select r.id from result_cleanup_runs r where r.result_id=rid) order by a.created_at,a.id;
end $$;
revoke all on function operator_cleanup_case_audit(uuid) from public,anon;
grant execute on function operator_cleanup_case_audit(uuid) to authenticated;
notify pgrst,'reload schema';
