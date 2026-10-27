-- Disposable synthetic metadata only. Storage byte deletion is tested separately
-- through the actual API. All fixtures/clock advancement below roll back.
begin;
set local storage.allow_delete_query='true';
create temporary table checks(label text,ok boolean);
create function pg_temp.check_that(label text,ok boolean) returns void language sql as $$insert into checks values(label,ok)$$;
create function pg_temp.allowed(stmt text) returns boolean language plpgsql as $$begin execute stmt;return true;exception when others then return false;end $$;
create function pg_temp.as_user(uid uuid,stmt text) returns boolean language plpgsql as $$begin
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claims',json_build_object('sub',uid)::text,true);
 begin execute stmt;exception when others then perform set_config('role','postgres',true);return false;end;
 perform set_config('role','postgres',true);return true;end $$;
insert into auth.users(id,email)values('91111111-1111-4111-8111-111111111111','cleanup-a@test.invalid'),('92222222-2222-4222-8222-222222222222','cleanup-b@test.invalid');
insert into profiles(id,username,display_name)values('91111111-1111-4111-8111-111111111111','cleanup_a','가'),('92222222-2222-4222-8222-222222222222','cleanup_b','나');
insert into projects(id,owner_id,name,default_visibility)values('93333333-3333-4333-8333-333333333333','91111111-1111-4111-8111-111111111111','보호할 편물 제목','public');
insert into results(id,project_id,owner_id,kind,ratio,output,file_path,thumb_path,display_title_override)
values('94444444-4444-4444-8444-444444444444','93333333-3333-4333-8333-333333333333','91111111-1111-4111-8111-111111111111','single','1:1','jpeg',
'91111111-1111-4111-8111-111111111111/93333333-3333-4333-8333-333333333333/results/94444444-4444-4444-8444-444444444444.jpg',
'91111111-1111-4111-8111-111111111111/93333333-3333-4333-8333-333333333333/results/94444444-4444-4444-8444-444444444444_t.jpg','지울 발행 제목');
insert into storage.objects(bucket_id,name,owner)select 'photos',file_path,owner_id from results union all select 'photos',thumb_path,owner_id from results;
select pg_temp.check_that('active results have no cleanup job',not exists(select 1 from result_cleanup_jobs));
select pg_temp.check_that('direct service storage delete fenced',not pg_temp.allowed($$delete from storage.objects where name like '%/results/%'$$));
select pg_temp.check_that('owner deletes publication',pg_temp.as_user('91111111-1111-4111-8111-111111111111',$$select delete_result('94444444-4444-4444-8444-444444444444')$$));
select pg_temp.check_that('delete creates durable two-object job',(select count(*)=1 from result_cleanup_jobs) and(select count(*)=2 from result_cleanup_objects));
select pg_temp.check_that('unknown legal review blocks without attempts',claim_result_cleanup() is null and (select sum(auto_attempts)=0 from result_cleanup_objects));
select pg_temp.check_that('unknown preserves titles',(select project_name_snapshot='보호할 편물 제목' and display_title_override='지울 발행 제목' from results));
select pg_temp.check_that('owner cannot approve own legal gate',not pg_temp.as_user('91111111-1111-4111-8111-111111111111',$$select review_result_retention('94444444-4444-4444-8444-444444444444','clear','qa:1')$$));
select pg_temp.check_that('owner cannot access worker manifest',not pg_temp.as_user('91111111-1111-4111-8111-111111111111',$$select * from result_cleanup_objects$$));
select pg_temp.check_that('owner cannot claim worker',not pg_temp.as_user('91111111-1111-4111-8111-111111111111',$$select claim_result_cleanup()$$));
insert into result_retention_reviewers(user_id)values('92222222-2222-4222-8222-222222222222');
select pg_temp.as_user('92222222-2222-4222-8222-222222222222',$$select review_result_retention('94444444-4444-4444-8444-444444444444','hold','qa:hold')$$);
select pg_temp.check_that('hold blocks without counting failure',claim_result_cleanup() is null and (select sum(auto_attempts)=0 from result_cleanup_objects));
select pg_temp.check_that('hold cannot be bypassed by direct title update',not pg_temp.allowed($$update results set project_name_snapshot=null,display_title_override=null,titles_purged_at=clock_timestamp()$$));
select pg_temp.as_user('92222222-2222-4222-8222-222222222222',$$select review_result_retention('94444444-4444-4444-8444-444444444444','clear','qa:clear')$$);
select claim_result_cleanup() as task \gset
select (:'task'::jsonb->>'id') jid,(:'task'::jsonb->>'token') token,(:'task'::jsonb->'object'->>'id') oid \gset
select pg_temp.check_that('single lease prevents duplicate claim',claim_result_cleanup() is null);
select pg_temp.check_that('eligible title purge verifies both fields',(select project_name_snapshot is null and display_title_override is null and titles_purged_at is not null and deleted_at is not null from results));
select pg_temp.check_that('project title remains intact',(select name='보호할 편물 제목' and deleted_at is null from projects));
select pg_temp.check_that('tombstone and result edition retained',(select count(*)=1 from results));
select finish_result_cleanup(:'jid',:'token','ABSENT');
select pg_temp.check_that('claimed absence cannot override present storage metadata',(select status='failed' and auto_attempts=1 from result_cleanup_objects where id=:'oid'));
select pg_temp.check_that('first retry from failure completion plus one minute',(select next_attempt_at between clock_timestamp()+interval '59 seconds' and clock_timestamp()+interval '61 seconds' from result_cleanup_objects where id=:'oid'));
-- Other object can succeed independently while the first waits.
select claim_result_cleanup() as task \gset
select (:'task'::jsonb->>'token') token,(:'task'::jsonb->'object'->>'id') success_oid,(:'task'::jsonb->'object'->>'path') success_path \gset
select pg_temp.check_that('exact leased metadata deletion allowed',pg_temp.allowed(format('delete from storage.objects where name=%L',:'success_path')));
select finish_result_cleanup(:'jid',:'token','ABSENT');
select pg_temp.check_that('partial never claims whole completion',(select status='partial' from result_cleanup_jobs) and(select count(*)=1 from result_cleanup_objects where status='confirmed'));
-- Mid-flight hold must be enforced INSIDE the Storage transaction.
update result_cleanup_objects set next_attempt_at=clock_timestamp()-interval '1 second' where status='failed';
select claim_result_cleanup() as task \gset
select (:'task'::jsonb->>'token') token,(:'task'::jsonb->'object'->>'path') path \gset
select pg_temp.as_user('92222222-2222-4222-8222-222222222222',$$select review_result_retention('94444444-4444-4444-8444-444444444444','hold','qa:race')$$);
select pg_temp.check_that('hold between claim and delete blocks Storage transaction',not pg_temp.allowed(format('delete from storage.objects where name=%L',:'path')));
select finish_result_cleanup(:'jid',:'token','VERIFY_FAILED');
select pg_temp.check_that('hold does not spend retry budget',(select auto_attempts=1 and status='pending' from result_cleanup_objects where id=:'oid'));
select pg_temp.check_that('verified object is never requeued',(select auto_attempts=1 and status='confirmed' from result_cleanup_objects where id=:'success_oid'));
select pg_temp.as_user('92222222-2222-4222-8222-222222222222',$$select review_result_retention('94444444-4444-4444-8444-444444444444','clear','qa:resume')$$);
do $$declare n int;task jsonb;delay int;begin
 for n in 2..6 loop
  update result_cleanup_objects set next_attempt_at=clock_timestamp()-interval '1 second' where status<>'confirmed';
  task:=claim_result_cleanup();perform finish_result_cleanup((task->>'id')::uuid,(task->>'token')::uuid,'STORAGE_ERROR');
  delay:=case n when 2 then 300 when 3 then 900 when 4 then 3600 else 10800 end;
  if n<6 then perform pg_temp.check_that('retry delay attempt '||n,(select next_attempt_at between clock_timestamp()+make_interval(secs=>delay-1) and clock_timestamp()+make_interval(secs=>delay+1) from result_cleanup_objects where status='failed'));end if;
 end loop;
end $$;
select pg_temp.check_that('six object attempts exhausted without seventh',claim_result_cleanup() is null and(select auto_attempts=6 and status='failed_exhausted' and next_attempt_at is null from result_cleanup_objects where id=:'oid'));
select pg_temp.check_that('link retry counters remain independent',not exists(select 1 from result_link_jobs));
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111"}',true);
select pg_temp.check_that('owner status has no title path token legal reference',(select count(*)=1 and bool_and(to_jsonb(s)::text not like '%지울%' and to_jsonb(s)::text not like '%/results/%' and to_jsonb(s)::text not like '%lease_token%' and to_jsonb(s)::text not like '%qa:resume%') from my_result_cleanup_status() s));
select set_config('request.jwt.claims','{"sub":"92222222-2222-4222-8222-222222222222"}',true);
select pg_temp.check_that('foreign owner cannot see cleanup status',not exists(select 1 from my_result_cleanup_status()));
select set_config('request.jwt.claims','{}',true);
-- Recovery at sixth interrupted attempt cannot loop; hold recovers without cost.
update result_cleanup_objects set status='processing',active_token=gen_random_uuid() where id=:'oid';
update result_cleanup_jobs set lease_token=(select active_token from result_cleanup_objects where id=:'oid'),lease_until=clock_timestamp()-interval '1 second';
select pg_temp.check_that('sixth expired lease cannot create seventh attempt',claim_result_cleanup() is null);
select pg_temp.check_that('sixth expired lease persists exhaustion',(select status='failed_exhausted' and auto_attempts=6 from result_cleanup_objects where id=:'oid'));
-- A separate legacy fixture cannot use origin-only proof to enter cleanup.
insert into results(id,project_id,owner_id,kind,ratio,output,file_path,thumb_path,legacy_links_unverified)
values('95555555-5555-4555-8555-555555555555','93333333-3333-4333-8333-333333333333','91111111-1111-4111-8111-111111111111','growth','1:1','mp4',
'91111111-1111-4111-8111-111111111111/93333333-3333-4333-8333-333333333333/results/95555555-5555-4555-8555-555555555555.mp4',
'91111111-1111-4111-8111-111111111111/93333333-3333-4333-8333-333333333333/results/95555555-5555-4555-8555-555555555555_t.jpg',true);
select pg_temp.as_user('91111111-1111-4111-8111-111111111111',$$select delete_result('95555555-5555-4555-8555-555555555555')$$);
select pg_temp.as_user('92222222-2222-4222-8222-222222222222',$$select review_result_retention('95555555-5555-4555-8555-555555555555','clear','qa:legacy')$$);
select pg_temp.check_that('real CDN proof cannot be bypassed for deleted legacy',result_cleanup_gate('95555555-5555-4555-8555-555555555555')='LINKS_UNCONFIRMED' and claim_result_cleanup() is null);
select pg_temp.check_that('legacy unknown link preserves stored title',(select project_name_snapshot is not null from results where id='95555555-5555-4555-8555-555555555555'));

-- The following is a SQL-only synthetic confirmed manifest, NOT CDN evidence.
-- It exercises all four inventory entries without adding a runtime bypass.
insert into storage.objects(bucket_id,name,owner)select 'photos',target_path,'91111111-1111-4111-8111-111111111111'::uuid from result_link_objects;
update result_link_objects set source_hash=repeat('a',64),activated_at=clock_timestamp(),removed_at=clock_timestamp(),origin_blocked_at=clock_timestamp(),cdn_verified_at=clock_timestamp();
update result_link_jobs set status='confirmed',next_attempt_at=null;
-- Inject title failure independently; file cleanup must continue and title may retry.
create function pg_temp.fail_title_purge() returns trigger language plpgsql as $$begin if NEW.titles_purged_at is not null and OLD.titles_purged_at is null then raise exception 'synthetic title failure';end if;return NEW;end $$;
create trigger synthetic_title_failure before update on results for each row execute function pg_temp.fail_title_purge();
do $$declare task jsonb;begin
 task:=claim_result_cleanup();
 perform pg_temp.check_that('confirmed legacy adds original and replacement manifests',(select count(*)=4 from result_cleanup_objects where job_id=(task->>'id')::uuid));
 perform pg_temp.check_that('title failure is independent and durable',(select title_status='failed' and title_attempts=1 from result_cleanup_jobs where id=(task->>'id')::uuid) and exists(select 1 from result_cleanup_attempts a where a.task='titles' and code='TITLE_PURGE_FAILED'));
 perform finish_result_cleanup((task->>'id')::uuid,(task->>'token')::uuid,'ABSENT');
end $$;
drop trigger synthetic_title_failure on results;
update result_cleanup_jobs set title_next_at=clock_timestamp()-interval '1 second' where title_status='failed';
do $$declare task jsonb;begin
 task:=claim_result_cleanup();
 perform pg_temp.check_that('title retry succeeds independently',(select title_status='confirmed' from result_cleanup_jobs where id=(task->>'id')::uuid));
 perform finish_result_cleanup((task->>'id')::uuid,(task->>'token')::uuid,'ABSENT');
 -- Both original keys already absent; next invocation must target a rotated key.
 task:=claim_result_cleanup();
 perform pg_temp.check_that('rotated target uses exact confirmed manifest',task->'object'->>'location'='rotated');
 execute format('delete from storage.objects where name=%L',task->'object'->>'path');
 perform finish_result_cleanup((task->>'id')::uuid,(task->>'token')::uuid,'ABSENT');
 task:=claim_result_cleanup();
 -- Expired lease under a new hold is recovered as a wait, without retry cost.
 perform set_config('request.jwt.claims','{"sub":"92222222-2222-4222-8222-222222222222"}',true);
 perform review_result_retention('95555555-5555-4555-8555-555555555555','hold','qa:expired-hold');
 update result_cleanup_jobs set lease_until=clock_timestamp()-interval '1 second' where id=(task->>'id')::uuid;
 perform pg_temp.check_that('expired held lease is not reclaimed',claim_result_cleanup() is null);
 perform pg_temp.check_that('expired held lease refunds attempt',(select status='pending' and auto_attempts=0 from result_cleanup_objects where id=(task->'object'->>'id')::uuid));
 perform review_result_retention('95555555-5555-4555-8555-555555555555','clear','qa:resume-expired');
 task:=claim_result_cleanup();
 execute format('delete from storage.objects where name=%L',task->'object'->>'path');
 perform finish_result_cleanup((task->>'id')::uuid,(task->>'token')::uuid,'ABSENT');
 perform pg_temp.check_that('all four verified and titles required for legacy completion',(select status='confirmed' from result_cleanup_jobs where id=(task->>'id')::uuid));
 perform pg_temp.check_that('cleaned paths cannot be reuploaded',not pg_temp.allowed(format('insert into storage.objects(bucket_id,name)values(''photos'',%L)',task->'object'->>'path')));
end $$;
select pg_temp.check_that('scheduled lateness recorded separately from retries',not exists(select 1 from result_cleanup_attempts where task='object' and (scheduled_at is null or schedule_delay_ms is null or schedule_delay_ms<0)));
select label,ok from checks order by label;
select count(*) total,count(*)filter(where ok) passed from checks;
do $$begin if exists(select 1 from checks where ok is distinct from true)then raise exception 'Result cleanup regression failed';end if;end $$;
rollback;
