-- Local/test database only. No real accounts, all test data rolled back.
begin;
-- Fixtures contain metadata only, never real Storage blobs. Match the Storage
-- API's transaction flag for SQL deletion simulations; rollback restores it.
-- https://github.com/supabase/storage/blob/master/migrations/tenant/0055-prevent-direct-deletes.sql
set local storage.allow_delete_query = 'true';
create temporary table checks(name text,ok boolean);
create function pg_temp.check_that(label text,pass boolean) returns void language sql as $$insert into checks values(label,pass)$$;
create function pg_temp.run_as(uid uuid,stmt text,as_role text default 'authenticated') returns boolean language plpgsql as $$
declare ok boolean:=true;
begin
 perform set_config('role',as_role,true);
 perform set_config('request.jwt.claims',json_build_object('sub',uid,'role',as_role)::text,true);
 begin execute stmt;exception when others then ok:=false;end;
 perform set_config('role','postgres',true);return ok;
end $$;
create function pg_temp.visible_as(uid uuid,table_name text,row_id uuid) returns boolean language plpgsql as $$
declare n int;
begin
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claims',json_build_object('sub',uid)::text,true);
 execute format('select count(*) from %I where id=$1',table_name) into n using row_id;
 perform set_config('role','postgres',true);return n>0;
end $$;
insert into auth.users(id,email)values
 ('11111111-1111-1111-1111-111111111111','a@p0.test'),('22222222-2222-2222-2222-222222222222','b@p0.test'),('33333333-3333-3333-3333-333333333333','c@p0.test');
insert into profiles(id,username,display_name,is_private)values
 ('11111111-1111-1111-1111-111111111111','p0_a','가',false),('22222222-2222-2222-2222-222222222222','p0_b','나',false),('33333333-3333-3333-3333-333333333333','p0_c','다',true);
insert into projects(id,owner_id,name,default_visibility)values
 ('a0000000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','공개','public'),
 ('a0000000-0000-4000-8000-000000000002','11111111-1111-1111-1111-111111111111','나만','private'),
 ('c0000000-0000-4000-8000-000000000001','33333333-3333-3333-3333-333333333333','비밀 편물','private'),
 ('c0000000-0000-4000-8000-000000000002','33333333-3333-3333-3333-333333333333','비공개계정 공개편물','public');
insert into posts(id,project_id,owner_id,photo_path,thumb_path,width,height,taken_at)values
 ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','a/day.jpg','a/dayt.jpg',1,1,now()),
 ('e0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','a/prior.jpg','a/priort.jpg',1,1,now());
insert into results(id,project_id,owner_id,kind,ratio,output,file_path,thumb_path,legacy_links_unverified)values
 ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','single','1:1','jpeg','11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000001/results/d0000000-0000-4000-8000-000000000001.jpg','11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000001/results/d0000000-0000-4000-8000-000000000001_t.jpg',true),
 ('d0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','33333333-3333-3333-3333-333333333333','single','1:1','jpeg','33333333-3333-3333-3333-333333333333/c0000000-0000-4000-8000-000000000002/results/d0000000-0000-4000-8000-000000000002.jpg','33333333-3333-3333-3333-333333333333/c0000000-0000-4000-8000-000000000002/results/d0000000-0000-4000-8000-000000000002_t.jpg',true);
insert into storage.objects(bucket_id,name,owner) select 'photos',file_path,owner_id from results;
-- A temporary test-only read policy reaches UPDATE/DELETE triggers even though
-- production SELECT RLS already hides result objects from authenticated clients.
create policy p0_test_result_read on storage.objects for select to authenticated
 using(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
select pg_temp.check_that('result object overwrite rejected by server',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update storage.objects set name=name where name='11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000001/results/d0000000-0000-4000-8000-000000000001.jpg'$$));
select pg_temp.check_that('result failure cleanup rejected by server',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$delete from storage.objects where name='11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000001/results/d0000000-0000-4000-8000-000000000001.jpg'$$));
select pg_temp.check_that('protected result object remains',exists(select 1 from storage.objects where name='11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000001/results/d0000000-0000-4000-8000-000000000001.jpg'));
insert into storage.objects(bucket_id,name,owner)values('photos','11111111-1111-1111-1111-111111111111/staged-daily.jpg','11111111-1111-1111-1111-111111111111');
select pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$delete from storage.objects where name='11111111-1111-1111-1111-111111111111/staged-daily.jpg'$$) as daily_cleanup_ok \gset
select pg_temp.check_that('daily upload failure cleanup remains permitted',:'daily_cleanup_ok'::boolean and not exists(select 1 from storage.objects where name='11111111-1111-1111-1111-111111111111/staged-daily.jpg'));
drop policy p0_test_result_read on storage.objects;
-- Gateway authorization is dynamic and never honors an old epoch after privacy changes.
select media_epoch::text as old_epoch from results where id='d0000000-0000-4000-8000-000000000001' \gset
select pg_temp.check_that('gateway target exists before a privacy change',(select count(*)=1 from result_media_target('d0000000-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222222',:'old_epoch','file')));
select pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select set_project_visibility('a0000000-0000-4000-8000-000000000001','private')$$);
select pg_temp.check_that('old owner ticket rejected after privacy epoch changes',(select count(*)=0 from result_media_target('d0000000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111',:'old_epoch','file')));
select media_epoch::text as private_epoch from results where id='d0000000-0000-4000-8000-000000000001' \gset
select pg_temp.check_that('fresh private owner ticket can be redeemed',(select count(*)=1 from result_media_target('d0000000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111',:'private_epoch','file')));
select pg_temp.check_that('fresh private outsider ticket rejected',(select count(*)=0 from result_media_target('d0000000-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222222',:'private_epoch','file')));
select pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select set_project_visibility('a0000000-0000-4000-8000-000000000001','public')$$);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',true);
select count(*)=0 as no_direct_result_storage from storage.objects where name='11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000001/results/d0000000-0000-4000-8000-000000000001.jpg' \gset
reset role;
select pg_temp.check_that('even active owner cannot bypass gateway Storage RLS',:'no_direct_result_storage'::boolean);
select pg_temp.check_that('private account public result denied to unapproved viewer',not pg_temp.visible_as('22222222-2222-2222-2222-222222222222','results','d0000000-0000-4000-8000-000000000002'));
-- Explicit storage permission query, not just a nonexistent-row control.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222"}',true);
select count(*)=0 as private_object_blocked from storage.objects where name='33333333-3333-3333-3333-333333333333/c0000000-0000-4000-8000-000000000002/results/d0000000-0000-4000-8000-000000000002.jpg' \gset
reset role;
select pg_temp.check_that('private account object actually blocked',:'private_object_blocked'::boolean);
select pg_temp.check_that('foreign project reassignment rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update posts set project_id='c0000000-0000-4000-8000-000000000001' where id='e0000000-0000-4000-8000-000000000001'$$));
select pg_temp.check_that('foreign project metadata remains private',not pg_temp.visible_as('22222222-2222-2222-2222-222222222222','projects','c0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('direct project scope bypass rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update projects set default_visibility='public' where id='a0000000-0000-4000-8000-000000000002'$$));
select pg_temp.check_that('owner project hard-delete rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$delete from projects where id='a0000000-0000-4000-8000-000000000001'$$));
select pg_temp.check_that('owner result hard-delete rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$delete from results where id='d0000000-0000-4000-8000-000000000001'$$));
select pg_temp.check_that('foreign project delete RPC rejected',not pg_temp.run_as('22222222-2222-2222-2222-222222222222',$$select soft_delete_project('a0000000-0000-4000-8000-000000000001')$$));
-- An individually removed record immediately before project deletion is never in its batch.
update posts set deleted_at=now()-interval '1 second' where id='e0000000-0000-4000-8000-000000000002';
select pg_temp.check_that('owner soft delete succeeds',pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select soft_delete_project('a0000000-0000-4000-8000-000000000001')$$));
select pg_temp.check_that('published result stays public after parent deletion',pg_temp.visible_as('22222222-2222-2222-2222-222222222222','results','d0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('deleted parent is inaccessible',not pg_temp.visible_as('22222222-2222-2222-2222-222222222222','projects','a0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('owner restore succeeds',pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select restore_project('a0000000-0000-4000-8000-000000000001')$$));
select pg_temp.check_that('restored project private',(select default_visibility='private' from projects where id='a0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('restored daily private and active',(select visibility='private' and deleted_at is null from posts where id='e0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('individually deleted record remains deleted',(select deleted_at is not null from posts where id='e0000000-0000-4000-8000-000000000002'));
select pg_temp.check_that('restored published result private',(select visibility='private' from results where id='d0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('restored result denied to other viewer',not pg_temp.visible_as('22222222-2222-2222-2222-222222222222','results','d0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('owner result deletion RPC succeeds',pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select delete_result('d0000000-0000-4000-8000-000000000001')$$));
select pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update results set deleted_at=null where id='d0000000-0000-4000-8000-000000000001'$$);
select pg_temp.check_that('deleted result cannot be restored via API',(select deleted_at is not null from results where id='d0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('deleted result hidden from owner',not pg_temp.visible_as('11111111-1111-1111-1111-111111111111','results','d0000000-0000-4000-8000-000000000001'));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',true);
select count(*)=0 as deleted_object_blocked from storage.objects where name='11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000001/results/d0000000-0000-4000-8000-000000000001.jpg' \gset
reset role;
select pg_temp.check_that('deleted result object denied even to owner',:'deleted_object_blocked'::boolean);
-- Only service code may redeem a ticket's viewer identity or change security state.
select pg_temp.check_that('client cannot spoof a media viewer',not pg_temp.run_as('22222222-2222-2222-2222-222222222222',$$select * from result_media_target('d0000000-0000-4000-8000-000000000002','33333333-3333-3333-3333-333333333333','1','file')$$));
select pg_temp.check_that('client cannot clear legacy media risk',not pg_temp.run_as('33333333-3333-3333-3333-333333333333',$$update results set legacy_links_unverified=false where id='d0000000-0000-4000-8000-000000000002'$$));
select pg_temp.check_that('foreign project cover rejected',not pg_temp.run_as('33333333-3333-3333-3333-333333333333',$$update projects set cover_post_id='e0000000-0000-4000-8000-000000000001' where id='c0000000-0000-4000-8000-000000000001'$$));
select pg_temp.check_that('legacy edition never inferred automatically',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select * from prepare_result_edition('a0000000-0000-4000-8000-000000000001',repeat('c',64))$$));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',true);
select count(*)=1 as risk_includes_deleted from my_legacy_link_risks() where id='d0000000-0000-4000-8000-000000000001' and deleted_at is not null \gset
select count(*)=0 as no_paths_in_risk from my_legacy_link_risks() r where row_to_json(r)::text like '%file_path%' or row_to_json(r)::text like '%/results/%' \gset
reset role;
select pg_temp.check_that('risk view includes deleted historical result',:'risk_includes_deleted'::boolean);
select pg_temp.check_that('risk view never exposes paths or URLs',:'no_paths_in_risk'::boolean);
-- Server-authenticated username capability, cooldown and reservation.
select pg_temp.check_that('direct username change rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update profiles set username='evil' where id='11111111-1111-1111-1111-111111111111'$$));
select pg_temp.check_that('direct cooldown modification rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update profiles set last_username_changed_at=now()-interval '31 days' where id='11111111-1111-1111-1111-111111111111'$$));
select pg_temp.check_that('verified RPC inaccessible to authenticated',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select change_username_verified('11111111-1111-1111-1111-111111111111','new_a')$$));
select pg_temp.check_that('first verified rename immediate',pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select change_username_verified('11111111-1111-1111-1111-111111111111','new_a')$$,'service_role'));
select pg_temp.check_that('old name permanently reserved',exists(select 1 from username_reservations where username='p0_a'));
select pg_temp.check_that('second immediate rename rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select change_username_verified('11111111-1111-1111-1111-111111111111','newer_a')$$,'service_role'));
select pg_temp.check_that('another owner cannot claim old name',not pg_temp.run_as('22222222-2222-2222-2222-222222222222',$$select change_username_verified('22222222-2222-2222-2222-222222222222','p0_a')$$,'service_role'));
select pg_temp.check_that('same-name retry succeeds',pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select change_username_verified('11111111-1111-1111-1111-111111111111','new_a')$$,'service_role'));
select last_username_changed_at::text as saved_change_time from profiles where id='11111111-1111-1111-1111-111111111111' \gset
select pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select change_username_verified('11111111-1111-1111-1111-111111111111','new_a')$$,'service_role');
select pg_temp.check_that('same-name does not restart cooldown',(select last_username_changed_at=:'saved_change_time'::timestamptz from profiles where id='11111111-1111-1111-1111-111111111111'));
update profiles set last_username_changed_at=clock_timestamp()-interval '719 hours' where id='11111111-1111-1111-1111-111111111111';
select pg_temp.check_that('719 hours rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select change_username_verified('11111111-1111-1111-1111-111111111111','newer_a')$$,'service_role'));
update profiles set last_username_changed_at=clock_timestamp()-interval '720 hours' where id='11111111-1111-1111-1111-111111111111';
select pg_temp.check_that('720 hours accepted',pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select change_username_verified('11111111-1111-1111-1111-111111111111','newer_a')$$,'service_role'));
select pg_temp.check_that('UUID and ownership unchanged',(select owner_id='11111111-1111-1111-1111-111111111111' from projects where id='a0000000-0000-4000-8000-000000000001'));
select pg_temp.check_that('whitespace display name rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update profiles set display_name='   ' where id='11111111-1111-1111-1111-111111111111'$$));
-- Server dates validate both SQL/API bypasses and local-zone today.
select pg_temp.check_that('future start rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update projects set started_at=current_date+2000 where id='a0000000-0000-4000-8000-000000000001'$$));
select pg_temp.check_that('future completion rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update projects set finished_at=current_date+2000 where id='a0000000-0000-4000-8000-000000000001'$$));
select pg_temp.check_that('reversed dates rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update projects set started_at='2020-01-02',finished_at='2020-01-01' where id='a0000000-0000-4000-8000-000000000001'$$));
select pg_temp.check_that('invalid timezone rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update projects set time_zone='Unknown/Place' where id='a0000000-0000-4000-8000-000000000001'$$));
select pg_temp.check_that('local-zone today accepted',pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update projects set time_zone='Asia/Seoul',started_at=(clock_timestamp() at time zone 'Asia/Seoul')::date,finished_at=(clock_timestamp() at time zone 'Asia/Seoul')::date where id='a0000000-0000-4000-8000-000000000001'$$));
-- Stable edition across retries/reentry and a distinct explicit remake.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',true);
select id as first_edition from prepare_result_edition('a0000000-0000-4000-8000-000000000002',repeat('a',64)) \gset
select id=:'first_edition'::uuid as same_edition from prepare_result_edition('a0000000-0000-4000-8000-000000000002',repeat('a',64)) \gset
insert into results(id,edition_id,project_id,owner_id,kind,ratio,output,visibility,file_path,thumb_path)
 values(:'first_edition',:'first_edition','a0000000-0000-4000-8000-000000000002','11111111-1111-1111-1111-111111111111','single','1:1','jpeg','public',
 '11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000002/results/'||:'first_edition'||'.jpg',
 '11111111-1111-1111-1111-111111111111/a0000000-0000-4000-8000-000000000002/results/'||:'first_edition'||'_t.jpg');
select state='published' as state_published from prepare_result_edition('a0000000-0000-4000-8000-000000000002',repeat('a',64)) \gset
reset role;
select pg_temp.check_that('automatic reentry reuses edition',:'same_edition'::boolean);
select pg_temp.check_that('server overrides stale public publication',(select visibility='private' from results where id=:'first_edition'));
select pg_temp.check_that('publication snapshot stored',(select project_name_snapshot='나만' from results where id=:'first_edition'));
select pg_temp.check_that('publication outcome survives response loss',:'state_published'::boolean);
select pg_temp.check_that('same edition duplicate rejected',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',format('insert into results select * from results where id=%L',:'first_edition')));
select pg_temp.run_as('11111111-1111-1111-1111-111111111111',format('select delete_result(%L)',:'first_edition'));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',true);
select state='deleted' as state_deleted from prepare_result_edition('a0000000-0000-4000-8000-000000000002',repeat('a',64)) \gset
select id as remake_edition from prepare_result_edition('a0000000-0000-4000-8000-000000000002',repeat('a',64),'f0000000-0000-4000-8000-000000000001') \gset
select id=:'remake_edition'::uuid as remake_idempotent from prepare_result_edition('a0000000-0000-4000-8000-000000000002',repeat('a',64),'f0000000-0000-4000-8000-000000000001') \gset
select id=:'remake_edition'::uuid as reentry_after_remake from prepare_result_edition('a0000000-0000-4000-8000-000000000002',repeat('a',64)) \gset
reset role;
select pg_temp.check_that('deleted edition retains tombstone',:'state_deleted'::boolean);
select pg_temp.check_that('explicit remake gets new edition',:'remake_edition'<>:'first_edition');
select pg_temp.check_that('remake request retry idempotent',:'remake_idempotent'::boolean);
select pg_temp.check_that('reentry uses latest explicit edition',:'reentry_after_remake'::boolean);
-- Account deletion is a service-only resumable capability, and active uploads are frozen.
insert into storage.objects(bucket_id,name,owner)values('photos','22222222-2222-2222-2222-222222222222/keep.jpg','22222222-2222-2222-2222-222222222222');
select pg_temp.check_that('old client deletion RPC is revoked',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select delete_my_account()$$));
select pg_temp.check_that('account job cannot be forged by authenticated',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$select begin_account_deletion('22222222-2222-2222-2222-222222222222')$$));
select begin_account_deletion('11111111-1111-1111-1111-111111111111')::text as deletion_lease \gset
select pg_temp.check_that('new upload blocked after deletion request',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$insert into storage.objects(bucket_id,name)values('photos','11111111-1111-1111-1111-111111111111/new.jpg')$$));
select pg_temp.check_that('new project blocked after deletion request',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$insert into projects(owner_id,name)values('11111111-1111-1111-1111-111111111111','must fail')$$));
select pg_temp.check_that('deletion marker cannot be reset by client',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',$$update profiles set deletion_requested_at=null where id='11111111-1111-1111-1111-111111111111'$$));
select pg_temp.check_that('file enumeration scoped to target',not exists(select 1 from account_deletion_objects('11111111-1111-1111-1111-111111111111',:'deletion_lease')where name not like '11111111-1111-1111-1111-111111111111/%'));
select pg_temp.check_that('account cannot finish while files remain',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',format('select finish_account_deletion(%L,%L)','11111111-1111-1111-1111-111111111111',:'deletion_lease'),'service_role'));
select pg_temp.check_that('auth identity retained after partial failure',exists(select 1 from auth.users where id='11111111-1111-1111-1111-111111111111'));
select fail_account_deletion('11111111-1111-1111-1111-111111111111',:'deletion_lease');
select begin_account_deletion('11111111-1111-1111-1111-111111111111')::text as new_deletion_lease \gset
select pg_temp.check_that('retry acquires a fresh lease',:'new_deletion_lease'<>:'deletion_lease');
select pg_temp.check_that('stale lease cannot complete another attempt',not pg_temp.run_as('11111111-1111-1111-1111-111111111111',format('select finish_account_deletion(%L,%L)','11111111-1111-1111-1111-111111111111',:'deletion_lease'),'service_role'));
-- Simulate only Storage metadata removal in this harness; real Storage HTTP is separate QA.
delete from storage.objects where bucket_id in ('photos','avatars') and (storage.foldername(name))[1]='11111111-1111-1111-1111-111111111111';
select finish_account_deletion('11111111-1111-1111-1111-111111111111',:'new_deletion_lease');
select pg_temp.check_that('identity removed only after all objects absent',not exists(select 1 from auth.users where id='11111111-1111-1111-1111-111111111111'));
select pg_temp.check_that('permanent name reservation survives account deletion',exists(select 1 from username_reservations where username='p0_a' and previous_owner_id is null));
select pg_temp.check_that('another users files and identity preserved',exists(select 1 from storage.objects where name='22222222-2222-2222-2222-222222222222/keep.jpg')and exists(select 1 from auth.users where id='22222222-2222-2222-2222-222222222222'));
select name,ok from checks order by name;
select count(*) as total,count(*) filter(where ok) as passed,count(*) filter(where not ok or ok is null) as failed from checks;
do $$begin if exists(select 1 from checks where ok is distinct from true) then raise exception 'P0 integrity regression failed';end if;end $$;
rollback;
