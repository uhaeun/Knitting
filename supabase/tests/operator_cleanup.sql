-- Synthetic disposable database fixtures only; no production objects or keys.
begin;
set local storage.allow_delete_query='true';
create temporary table checks(label text,ok boolean);
create function pg_temp.check_that(label text,ok boolean) returns void language sql as $$insert into checks values(label,ok)$$;
create function pg_temp.allowed(stmt text) returns boolean language plpgsql as $$begin execute stmt;return true;exception when others then return false;end $$;
create function pg_temp.user_json(uid uuid,stmt text) returns jsonb language plpgsql as $$declare response jsonb;begin
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claims',json_build_object('sub',uid)::text,true);
 begin execute stmt into response;exception when others then perform set_config('role','postgres',true);return jsonb_build_object('error',SQLSTATE);end;
 perform set_config('role','postgres',true);return response;end $$;
insert into auth.users(id,email)values('a1111111-1111-4111-8111-111111111111','operator-owner@test.invalid'),('a2222222-2222-4222-8222-222222222222','operator-viewer@test.invalid'),('a3333333-3333-4333-8333-333333333333','operator-executor@test.invalid');
insert into profiles(id,username,display_name)values('a1111111-1111-4111-8111-111111111111','ops_owner','O'),('a2222222-2222-4222-8222-222222222222','ops_viewer','V'),('a3333333-3333-4333-8333-333333333333','ops_executor','E');
insert into projects(id,owner_id,name)values('a4444444-4444-4444-8444-444444444444','a1111111-1111-4111-8111-111111111111','保護原本');
insert into results(id,project_id,owner_id,kind,ratio,output,file_path,thumb_path)
values('a5555555-5555-4555-8555-555555555555','a4444444-4444-4444-8444-444444444444','a1111111-1111-4111-8111-111111111111','single','1:1','jpeg',
'a1111111-1111-4111-8111-111111111111/a4444444-4444-4444-8444-444444444444/results/a5555555-5555-4555-8555-555555555555.jpg',
'a1111111-1111-4111-8111-111111111111/a4444444-4444-4444-8444-444444444444/results/a5555555-5555-4555-8555-555555555555_t.jpg');
insert into storage.objects(bucket_id,name,owner)select 'photos',file_path,owner_id from results union all select 'photos',thumb_path,owner_id from results;
select pg_temp.check_that('worker role cannot mutate or truncate audit history',not has_table_privilege('service_role','cleanup_operator_audit','UPDATE,DELETE,TRUNCATE'));
select pg_temp.check_that('operators are not provisioned by migration',not exists(select 1 from cleanup_operators));
select pg_temp.check_that('normal user cannot list cases',(pg_temp.user_json('a1111111-1111-4111-8111-111111111111',$$select to_jsonb(operator_cleanup_cases())$$)->>'error')='42501');
select pg_temp.check_that('normal user cannot self assign a role',(pg_temp.user_json('a1111111-1111-4111-8111-111111111111',$$insert into cleanup_operators(user_id,role)values('a1111111-1111-4111-8111-111111111111','executor')returning to_jsonb(cleanup_operators)$$)->>'error')='42501');
insert into cleanup_operators(user_id,role)values('a2222222-2222-4222-8222-222222222222','viewer'),('a3333333-3333-4333-8333-333333333333','executor');
insert into result_retention_reviewers(user_id)values('a3333333-3333-4333-8333-333333333333');
select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111"}',true);
select delete_result('a5555555-5555-4555-8555-555555555555');
select set_config('request.jwt.claims','{"sub":"a3333333-3333-4333-8333-333333333333"}',true);
select pg_temp.check_that('unknown retention cannot be overridden by executor',(preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555')->>'reason')='RETENTION_UNKNOWN');
select review_result_retention('a5555555-5555-4555-8555-555555555555','clear','qa:synthetic');
select pg_temp.check_that('automatic work not exhausted cannot be requested',(preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555')->>'reason')='AUTOMATIC_PENDING');
-- Run all twelve actual SQL automatic failures; each object independently uses six.
do $$declare t jsonb;n int;begin for n in 1..12 loop
 update result_cleanup_objects set next_attempt_at=clock_timestamp()-interval '1 second' where status<>'failed_exhausted';
 t:=claim_result_cleanup();perform finish_result_cleanup((t->>'id')::uuid,(t->>'token')::uuid,'STORAGE_ERROR');
end loop;end $$;
select pg_temp.check_that('both objects exhaust exactly six automatic attempts',(select bool_and(auto_attempts=6 and status='failed_exhausted') from result_cleanup_objects));
select pg_temp.check_that('viewer may inspect but not execute',(pg_temp.user_json('a2222222-2222-4222-8222-222222222222',$$select preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555')$$)->>'reason')='EXECUTOR_REQUIRED');
select set_config('request.jwt.claims','{"sub":"a3333333-3333-4333-8333-333333333333"}',true);
select review_result_retention('a5555555-5555-4555-8555-555555555555','hold','qa:hold');
select pg_temp.check_that('manual execution cannot override hold',(preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555')->>'reason')='RETENTION_HOLD');
select review_result_retention('a5555555-5555-4555-8555-555555555555','clear','qa:clear');
select preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555') as expiring \gset
update cleanup_operator_previews set expires_at=clock_timestamp()-interval '1 second' where id=(:'expiring'::jsonb->>'preview_id')::uuid;
select pg_temp.check_that('expired preview cannot queue a run',(request_manual_result_cleanup('a5555555-5555-4555-8555-555555555555',(:'expiring'::jsonb->>'preview_id')::uuid,gen_random_uuid())->>'reason')='PREVIEW_EXPIRED');
select preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555') as expiring \gset
update cleanup_operators set role='viewer' where user_id='a3333333-3333-4333-8333-333333333333';
update cleanup_operators set role='executor' where user_id='a3333333-3333-4333-8333-333333333333';
select pg_temp.check_that('regrant does not revive an old confirmation',(request_manual_result_cleanup('a5555555-5555-4555-8555-555555555555',(:'expiring'::jsonb->>'preview_id')::uuid,gen_random_uuid())->>'reason')='PREVIEW_EXPIRED');
select preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555') as preview \gset
select (:'preview'::jsonb->>'preview_id') pid \gset
select pg_temp.check_that('preview has exact count without paths',(:'preview'::jsonb->>'remaining')::int=2 and :'preview' not like '%/results/%' and :'preview' not like '%保護%');
-- A changed last failure invalidates a previously shown confirmation.
update result_cleanup_objects set last_code='NETWORK_ERROR'where asset='file';
select request_manual_result_cleanup('a5555555-5555-4555-8555-555555555555',:'pid',gen_random_uuid()) as rejected \gset
select pg_temp.check_that('stale confirmation is rejected durably',(:'rejected'::jsonb->>'reason')='SELECTION_CHANGED' and exists(select 1 from cleanup_operator_audit where code='SELECTION_CHANGED'));
select preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555') as preview \gset
select (:'preview'::jsonb->>'preview_id') pid,gen_random_uuid() requestid \gset
select request_manual_result_cleanup('a5555555-5555-4555-8555-555555555555',:'pid',:'requestid') as requested \gset
select (:'requested'::jsonb->>'job_id') runid \gset
select pg_temp.check_that('manual run starts at version one',(select status_version=1 from result_cleanup_runs where id=:'runid'));
select pg_temp.check_that('same request is idempotent',(request_manual_result_cleanup('a5555555-5555-4555-8555-555555555555',:'pid',:'requestid')->>'job_id')=:'runid' and (select count(*)=1 from result_cleanup_runs));
select pg_temp.check_that('second active request is rejected',(request_manual_result_cleanup('a5555555-5555-4555-8555-555555555555',:'pid',gen_random_uuid())->>'reason')='BUSY');
select pg_temp.check_that('snapshot uses string bigint and nonce',(operator_cleanup_status(:'runid',:'requestid')->>'status_version')='1' and (operator_cleanup_status(:'runid',:'requestid')->>'request_id')=:'requestid');
select pg_temp.check_that('status read does not change versions',(select status_version=1 from result_cleanup_runs where id=:'runid'));
select pg_temp.check_that('normal user cannot read manual status',(pg_temp.user_json('a1111111-1111-4111-8111-111111111111',format('select operator_cleanup_status(%L,%L)',:'runid',:'requestid'))->>'error')='42501');
select pg_temp.check_that('internal tables and automatic helper are denied',(pg_temp.user_json('a3333333-3333-4333-8333-333333333333',$$select to_jsonb(t) from result_cleanup_runs t$$)->>'error')='42501' and not has_function_privilege('service_role','claim_automatic_result_cleanup()','EXECUTE'));
select claim_result_cleanup() as task \gset
select (:'task'::jsonb->>'id') jid,(:'task'::jsonb->>'token') token,(:'task'::jsonb->'object'->>'path') path \gset
select pg_temp.check_that('one lease prevents a duplicate worker',claim_result_cleanup() is null);
select pg_temp.check_that('manual counter does not reset automatic six',(select sum(auto_attempts)=12 and sum(manual_attempts)=1 from result_cleanup_objects));
select pg_temp.check_that('manual exact target deletion allowed',pg_temp.allowed(format('delete from storage.objects where name=%L',:'path')));
select finish_result_cleanup(:'jid',:'token','ABSENT');
select pg_temp.check_that('partial progress is not whole cleanup',(select state->>'status'='processing' from result_cleanup_runs where id=:'runid') and(select status<>'confirmed' from result_cleanup_jobs));
select claim_result_cleanup() as task \gset
select (:'task'::jsonb->>'token') token,(:'task'::jsonb->'object'->>'path') path \gset
select finish_result_cleanup(:'jid',:'token','STORAGE_ERROR');
select pg_temp.check_that('manual partial failure stays exhausted without auto restart',(select state->>'status'='partial' and (state->>'can_retry')::boolean from result_cleanup_runs where id=:'runid') and (select bool_and(auto_attempts=6 and next_attempt_at is null) from result_cleanup_objects) and claim_result_cleanup() is null);
select pg_temp.check_that('same transaction changes allocate one version',(select status_version=1 from result_cleanup_runs where id=:'runid'));
select preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555') as preview \gset
select (:'preview'::jsonb->>'preview_id') pid \gset
select pg_temp.check_that('retry preview excludes verified success',(:'preview'::jsonb->>'remaining')::int=1);
select request_manual_result_cleanup('a5555555-5555-4555-8555-555555555555',:'pid',gen_random_uuid()) as requested \gset
select (:'requested'::jsonb->>'job_id') revoked_run \gset
select claim_result_cleanup() as task \gset
select (:'task'::jsonb->>'token') token,(:'task'::jsonb->'object'->>'path') path \gset
update cleanup_operators set role='viewer'where user_id='a3333333-3333-4333-8333-333333333333';
select pg_temp.check_that('role revocation fences Storage after claim',not pg_temp.allowed(format('delete from storage.objects where name=%L',:'path')));
select finish_result_cleanup(:'jid',:'token','VERIFY_FAILED');
select pg_temp.check_that('revocation records blocked state without auto counter change',(select state->>'status'='blocked' and state->>'reason'='OPERATOR_REVOKED' from result_cleanup_runs where id=:'revoked_run') and(select sum(auto_attempts)=12 from result_cleanup_objects));
update cleanup_operators set role='executor'where user_id='a3333333-3333-4333-8333-333333333333';
select preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555') as preview \gset
select (:'preview'::jsonb->>'preview_id') pid \gset
select request_manual_result_cleanup('a5555555-5555-4555-8555-555555555555',:'pid',gen_random_uuid()) as requested \gset
select (:'requested'::jsonb->>'job_id') last_run \gset
select claim_result_cleanup() as task \gset
select (:'task'::jsonb->>'token') token,(:'task'::jsonb->'object'->>'path') path \gset
select pg_temp.check_that('only remaining object claimed',(select count(*)=1 from result_cleanup_objects where active_token=:'token'));
select pg_temp.check_that('success object manual count never increases',(select manual_attempts=1 from result_cleanup_objects where status='confirmed'));
select pg_temp.check_that('final exact file deletion allowed',pg_temp.allowed(format('delete from storage.objects where name=%L',:'path')));
select finish_result_cleanup(:'jid',:'token','ABSENT');
select pg_temp.check_that('all objects confirmed yields cumulative completion',(select status='confirmed' from result_cleanup_jobs) and(select state->>'status'='succeeded' from result_cleanup_runs where id=:'last_run'));
select pg_temp.check_that('tombstone and project name retained',(select count(*)=1 from results where deleted_at is not null) and(select name='保護原本' from projects));
select pg_temp.check_that('snapshot and audit contain no media or credentials',operator_cleanup_status(:'last_run',gen_random_uuid())::text not like '%/results/%' and not exists(select 1 from cleanup_operator_audit where to_jsonb(cleanup_operator_audit)::text like '%保護%'));
select pg_temp.check_that('audit is available only to operators',(pg_temp.user_json('a1111111-1111-4111-8111-111111111111',format('select to_jsonb(operator_cleanup_audit(%L))',:'last_run'))->>'error')='42501');
select pg_temp.check_that('read-only status remains readable for viewer',pg_temp.user_json('a2222222-2222-4222-8222-222222222222',format('select operator_cleanup_status(%L,%L)',:'last_run',:'requestid')) ? 'status_version');
select pg_temp.check_that('all rejections have minimal error identifiers',not exists(select 1 from cleanup_operator_audit where code in('EXECUTOR_REQUIRED','SELECTION_CHANGED','BUSY') and error_id is null));
select set_config('request.jwt.claims','{"sub":"a3333333-3333-4333-8333-333333333333"}',true);
select gen_random_uuid() faultid \gset
select report_cleanup_snapshot_issue(:'last_run',:'faultid','9007199254740993',clock_timestamp());
select report_cleanup_snapshot_issue(:'last_run',:'faultid','9007199254740993',clock_timestamp());
select pg_temp.check_that('minimum snapshot fault audit deduplicates without ambiguity',(select count(*)=1 and min(status_version)=9007199254740993 from cleanup_operator_audit where error_id=:'faultid'));
-- Fixture-only saturation, representing a previous committed transaction.
alter table result_cleanup_runs disable trigger manual_cleanup_version;
update result_cleanup_runs set status_version=9223372036854775807,version_xid=0 where id=:'last_run';
alter table result_cleanup_runs enable trigger manual_cleanup_version;
select pg_temp.check_that('saturated BIGINT is serialized without rounding',operator_cleanup_status(:'last_run',gen_random_uuid())->>'status_version'='9223372036854775807');
select pg_temp.check_that('overflow rejects state transaction atomically',not pg_temp.allowed(format('update result_cleanup_runs set state=state||%L::jsonb where id=%L','{"reason":"UNEXPECTED"}',:'last_run')) and(select state->>'reason'<>'UNEXPECTED' and status_version=9223372036854775807 from result_cleanup_runs where id=:'last_run'));
select pg_temp.check_that('version limit cannot be reset by a fresh run',(preview_manual_result_cleanup('a5555555-5555-4555-8555-555555555555')->>'reason')='VERSION_LIMIT');
select pg_temp.check_that('version edits are never a user API',not pg_temp.allowed(format('update result_cleanup_runs set status_version=1 where id=%L',:'last_run')));
select pg_temp.check_that('denials are readable via the scoped case audit',exists(select 1 from operator_cleanup_case_audit('a5555555-5555-4555-8555-555555555555')where code='SELECTION_CHANGED'));
select label,ok from checks order by label;
select count(*) total,count(*) filter(where ok) passed from checks;
do $$begin if exists(select 1 from checks where ok is distinct from true)then raise exception 'Operator cleanup regression failed';end if;end $$;
rollback;
