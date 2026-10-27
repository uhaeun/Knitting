-- PROJ-036..040: deleted publication cleanup. No default legal decision and no
-- bypass of legacy CDN proof. Previous applied migrations remain unchanged.
alter table results add column titles_purged_at timestamptz;
create table result_retention_reviewers (
 user_id uuid primary key references profiles(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
create table result_retention_reviews (
 result_id uuid primary key references results(id) on delete cascade,
 decision text not null check(decision in('unknown','clear','hold')),
 version bigint not null default 1 check(version>0),
 reviewer_id uuid references profiles(id) on delete set null,
 reference text not null check(reference ~ '^[a-zA-Z0-9:_./-]{1,120}$'),
 reviewed_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
create table result_retention_events (
 id uuid primary key default gen_random_uuid(),result_id uuid not null references results(id) on delete cascade,
 decision text not null,version bigint not null,reviewer_id uuid references profiles(id) on delete set null,reference text not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
create table result_cleanup_jobs (
 id uuid primary key default gen_random_uuid(),result_id uuid not null unique references results(id) on delete cascade,
 owner_id uuid not null references profiles(id) on delete cascade,
 status text not null default 'blocked' check(status in('blocked','pending','processing','partial','failed_exhausted','confirmed')),
 title_status text not null default 'pending' check(title_status in('pending','confirmed','failed','failed_exhausted')),
 title_attempts int not null default 0 check(title_attempts between 0 and 6),title_next_at timestamptz default clock_timestamp(),
 title_code text,title_verified_at timestamptz,
 lease_token uuid,lease_until timestamptz,review_version bigint,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
create table result_cleanup_objects (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references result_cleanup_jobs(id) on delete cascade,
 asset text not null check(asset in('file','thumb')),location text not null check(location in('original','rotated')),path text not null,
 status text not null default 'pending' check(status in('pending','processing','failed','failed_exhausted','confirmed')),
 auto_attempts int not null default 0 check(auto_attempts between 0 and 6),next_attempt_at timestamptz default clock_timestamp(),
 active_token uuid,verified_at timestamptz,last_code text,last_failure_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz,
 unique(job_id,path)
);
create table result_cleanup_attempts (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references result_cleanup_jobs(id) on delete cascade,
 object_id uuid references result_cleanup_objects(id) on delete cascade,token uuid not null unique,
 task text not null default 'object' check(task in('object','titles')),
 attempt_no int,scheduled_at timestamptz,started_at timestamptz not null default clock_timestamp(),schedule_delay_ms bigint check(schedule_delay_ms>=0),code text,finished_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),deleted_at timestamptz
);
do $$declare t text;begin
 foreach t in array array['result_retention_reviewers','result_retention_reviews','result_retention_events','result_cleanup_jobs','result_cleanup_objects','result_cleanup_attempts'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public,anon,authenticated',t);
  execute format('grant all on %I to service_role',t);
 end loop;
end $$;

create function review_result_retention(rid uuid,decision text,reference text) returns void
language plpgsql security definer set search_path=public as $$
declare v bigint;
begin
 if not exists(select 1 from result_retention_reviewers a join profiles p on p.id=a.user_id where a.user_id=auth.uid() and a.deleted_at is null and p.deleted_at is null and p.deletion_requested_at is null) then
  raise exception '보존 검토 권한이 필요해요' using errcode='42501';end if;
 if decision is null or decision not in('unknown','clear','hold') or reference is null or reference !~ '^[a-zA-Z0-9:_./-]{1,120}$' then raise exception '검토 기록을 확인해 주세요' using errcode='23514';end if;
 -- All cleanup/retention writers lock result before review/job. Storage's final
 -- delete fence holds the result/review SHARE locks until the API commits.
 perform 1 from results where id=rid and deleted_at is not null for update;
 if not found then raise exception '삭제 결과물을 찾을 수 없어요' using errcode='P0002';end if;
 insert into result_retention_reviews(result_id,decision,reviewer_id,reference)
 values(rid,decision,auth.uid(),reference)
 on conflict(result_id)do update set decision=excluded.decision,version=result_retention_reviews.version+1,
 reviewer_id=excluded.reviewer_id,reference=excluded.reference,reviewed_at=clock_timestamp(),updated_at=clock_timestamp(),deleted_at=null
 returning version into v;
 insert into result_retention_events(result_id,decision,version,reviewer_id,reference)values(rid,decision,v,auth.uid(),reference);
end $$;
revoke all on function review_result_retention(uuid,text,text) from public,anon;
grant execute on function review_result_retention(uuid,text,text) to authenticated;

create function enqueue_result_cleanup(rid uuid) returns void language plpgsql security definer set search_path=public as $$
declare r results;jid uuid;
begin
 select * into r from results where id=rid and deleted_at is not null;
 if not found then return;end if;
 insert into result_cleanup_jobs(result_id,owner_id)values(r.id,r.owner_id)on conflict(result_id)do nothing returning id into jid;
 if jid is null then return;end if;
 insert into result_cleanup_objects(job_id,asset,location,path)values(jid,'file','original',r.file_path),(jid,'thumb','original',r.thumb_path);
end $$;
revoke all on function enqueue_result_cleanup(uuid) from public,anon,authenticated;
grant execute on function enqueue_result_cleanup(uuid) to service_role;
create function queue_deleted_result_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.deleted_at is not null and (TG_OP='INSERT' or OLD.deleted_at is null) then perform enqueue_result_cleanup(NEW.id);end if;return NEW;
end $$;
create trigger result_cleanup_queue after insert or update of deleted_at on results for each row execute function queue_deleted_result_cleanup();
select enqueue_result_cleanup(id) from results where deleted_at is not null;

-- Pure eligibility query: unknown legal decisions never silently become clear.
create function result_cleanup_gate(rid uuid) returns text language plpgsql stable security definer set search_path=public as $$
declare r results;review result_retention_reviews;lj result_link_jobs;o result_link_objects;expected text;
begin
 select * into r from results where id=rid;
 if not found or r.deleted_at is null then return 'NOT_DELETED';end if;
 if not exists(select 1 from profiles where id=r.owner_id and deleted_at is null and deletion_requested_at is null) then return 'ACCOUNT_DELETION';end if;
 select * into review from result_retention_reviews where result_id=rid and deleted_at is null;
 if review.result_id is null or review.decision='unknown' then return 'RETENTION_UNKNOWN';end if;
 if review.decision='hold' then return 'RETENTION_HOLD';end if;
 expected:=r.owner_id::text||'/'||r.project_id::text||'/results/'||r.id::text;
 if exists(select 1 from result_cleanup_jobs where result_id=rid and owner_id<>r.owner_id) then return 'OWNER_MISMATCH';end if;
 if r.file_path<>expected||(case when r.output='mp4' then '.mp4' else '.jpg' end) or r.thumb_path<>expected||'_t.jpg' then return 'UNSAFE_PATH';end if;
 select * into lj from result_link_jobs where result_id=rid;
 if r.legacy_links_unverified or lj.id is not null then
  if lj.id is null or lj.status<>'confirmed' or (select count(*) from result_link_objects where job_id=lj.id and cdn_verified_at is not null and removed_at is not null and activated_at is not null)<>2 then return 'LINKS_UNCONFIRMED';end if;
  for o in select * from result_link_objects where job_id=lj.id loop
   if o.source_path<>(case when o.asset='file' then r.file_path else r.thumb_path end)
    or o.target_path<>expected||'/revoked/'||lj.id::text||(case when o.asset='thumb' then '/thumb.jpg' when r.output='mp4' then '/file.mp4' else '/file.jpg' end)
    or exists(select 1 from storage.objects where bucket_id='photos' and name=o.source_path) then return 'LINKS_UNCONFIRMED';end if;
  end loop;
 end if;
 if exists(select 1 from storage.buckets b where b.id='photos' and coalesce(to_jsonb(b)->>'versioning_status','DISABLED')<>'DISABLED') then return 'VERSIONING_UNSUPPORTED';end if;
 if exists(select 1 from storage.objects x where x.bucket_id='photos' and (x.name in(r.file_path,r.thumb_path) or x.name in(select target_path from result_link_objects where job_id=lj.id)) and (coalesce(to_jsonb(x)->>'is_versioned','false')='true' or coalesce(to_jsonb(x)->>'is_delete_marker','false')='true' or to_jsonb(x)->>'archived_at' is not null)) then return 'VERSIONING_UNSUPPORTED';end if;
 return 'READY';
end $$;
revoke all on function result_cleanup_gate(uuid) from public,anon,authenticated;
grant execute on function result_cleanup_gate(uuid) to service_role;

create function cleanup_title_transition_ok(old_row results,new_row results) returns boolean
language sql stable security definer set search_path=public as $$
 select old_row.deleted_at is not null and new_row.project_name_snapshot is null and new_row.display_title_override is null and new_row.titles_purged_at is not null
 and old_row.titles_purged_at is null
 and (to_jsonb(old_row)-array['project_name_snapshot','display_title_override','titles_purged_at','updated_at'])=(to_jsonb(new_row)-array['project_name_snapshot','display_title_override','titles_purged_at','updated_at'])
 and result_cleanup_gate(old_row.id)='READY';
$$;
revoke all on function cleanup_title_transition_ok(results,results) from public,anon,authenticated;
-- Preserve all original ownership/edition restrictions. Only the narrowly checked
-- server title purge is an exception; deleted publications still cannot be restored.
create or replace function guard_media_write() returns trigger language plpgsql security definer set search_path=public as $$
declare p projects;
begin
 if TG_OP='UPDATE' then
  if NEW.owner_id<>OLD.owner_id or NEW.project_id<>OLD.project_id or NEW.id<>OLD.id then raise exception '기록의 소유자와 편물은 바꿀 수 없어요' using errcode='23514';end if;
  if TG_TABLE_NAME='results' then
   if NEW.file_path<>OLD.file_path or NEW.thumb_path<>OLD.thumb_path or NEW.created_at<>OLD.created_at then raise exception '발행 원본은 바꿀 수 없어요' using errcode='23514';end if;
   if NEW.project_name_snapshot is distinct from OLD.project_name_snapshot and not cleanup_title_transition_ok(OLD,NEW) then raise exception '발행 원본은 바꿀 수 없어요' using errcode='23514';end if;
  end if;
 else
  select * into p from projects where id=NEW.project_id for update;
  if p.id is null or p.owner_id<>NEW.owner_id or p.deleted_at is not null then raise exception '기록을 추가할 편물을 찾을 수 없어요' using errcode='23514';end if;
  NEW.visibility:=p.default_visibility;
  if TG_TABLE_NAME='results' then NEW.project_name_snapshot:=p.name;end if;
 end if;return NEW;
end $$;
create or replace function guard_result_transition() returns trigger language plpgsql set search_path=public as $$
begin
 if current_user in('authenticated','anon') and (NEW.deleted_at is distinct from OLD.deleted_at or NEW.visibility is distinct from OLD.visibility or NEW.titles_purged_at is distinct from OLD.titles_purged_at) then
  raise exception '결과물 전용 변경 기능을 이용해 주세요' using errcode='42501';end if;
 if OLD.deleted_at is not null then
  if current_user<>'postgres' then raise exception '삭제한 결과물은 수정할 수 없어요' using errcode='23514';end if;
  if not cleanup_title_transition_ok(OLD,NEW) then raise exception '삭제한 결과물은 복원하거나 수정할 수 없어요' using errcode='23514';end if;
 end if;return NEW;
end $$;
create function guard_cleanup_inventory() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME='results' then
  if NEW.titles_purged_at is not null then raise exception '제목 정리는 서버에서 처리해요' using errcode='42501';end if;
 else
  if NEW.bucket_id='photos' and (TG_OP='INSERT' or NEW.name is distinct from OLD.name or NEW.bucket_id is distinct from OLD.bucket_id)
    and exists(select 1 from result_cleanup_objects o join result_cleanup_jobs j on j.id=o.job_id join results r on r.id=j.result_id where o.path=NEW.name and r.deleted_at is not null) then
    raise exception '삭제한 결과물 경로는 다시 사용할 수 없어요' using errcode='42501';end if;
 end if;return NEW;
end $$;
create trigger result_cleanup_inventory before insert on results for each row execute function guard_cleanup_inventory();
create trigger result_cleanup_path_reuse before insert or update on storage.objects for each row execute function guard_cleanup_inventory();

create function cleanup_snapshot(jid uuid,token uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare j result_cleanup_jobs;r results;review result_retention_reviews;reason text;
begin
 select * into j from result_cleanup_jobs where id=jid;
 select * into r from results where id=j.result_id for share;
 select * into review from result_retention_reviews where result_id=r.id for share;
 select * into j from result_cleanup_jobs where id=jid for update;
 if j.id is null or j.lease_token is distinct from token or j.lease_until<=clock_timestamp() then raise exception '정리 작업 임대가 만료됐어요' using errcode='42501';end if;
 reason:=result_cleanup_gate(r.id);
 if reason='READY' and review.version is distinct from j.review_version then reason:='REVIEW_CHANGED';end if;
 update result_cleanup_jobs set lease_until=clock_timestamp()+interval '5 minutes' where id=jid;
 return jsonb_build_object('id',j.id,'token',token,'result_id',r.id,'owner_id',r.owner_id,'project_id',r.project_id,'eligible',reason='READY','reason',reason,
 'object',(select to_jsonb(o)||jsonb_build_object('metadata_present',exists(select 1 from storage.objects s where s.bucket_id='photos' and s.name=o.path)) from result_cleanup_objects o where o.job_id=jid and o.active_token=token));
end $$;

create function claim_result_cleanup() returns jsonb language plpgsql security definer set search_path=public as $$
declare j result_cleanup_jobs;r results;review result_retention_reviews;o result_cleanup_objects;token uuid:=gen_random_uuid(); n int;reason text;
begin
 -- Lock the result first, including during lease recovery. A changed legal
 -- decision is a wait condition, never a counted deletion failure.
 for r in select rr.* from results rr where exists(select 1 from result_cleanup_jobs q where q.result_id=rr.id and q.lease_until<=clock_timestamp()) for update skip locked loop
  select * into j from result_cleanup_jobs where result_id=r.id and lease_until<=clock_timestamp() for update skip locked;
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
 where rr.deleted_at is not null and q.status<>'confirmed' and q.lease_token is null and result_cleanup_gate(rr.id)='READY'
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

-- This final fence runs inside the Storage API transaction BEFORE its backend
-- deletion. Legal changes lock result/review in the same order and cannot race it.
create function assert_result_storage_delete(path text) returns void language plpgsql security definer set search_path=public as $$
declare r results;j result_cleanup_jobs;o result_cleanup_objects;review result_retention_reviews;lj result_link_jobs;lo result_link_objects;
begin
 -- Preserve the separate explicit account deletion path.
 if exists(select 1 from profiles p join account_deletion_jobs a on a.owner_id=p.id where p.id::text=split_part(path,'/',1) and p.deletion_requested_at is not null and a.status='processing' and a.lease_until>clock_timestamp()) then return;end if;
 select rr.* into r from results rr where rr.file_path=path or rr.thumb_path=path or exists(select 1 from result_link_objects x join result_link_jobs l on l.id=x.job_id where l.result_id=rr.id and x.target_path=path) for share;
 if r.id is null then raise exception '정리 대상 파일을 확인할 수 없어요' using errcode='42501';end if;
 if exists(select 1 from posts where photo_path=path or thumb_path=path or video_path=path)
  or exists(select 1 from results where id<>r.id and (file_path=path or thumb_path=path)) then raise exception '원본/다른 결과물 참조가 있어요' using errcode='42501';end if;
 -- Legacy retirement may delete only its original key after verified activation.
 select l.* into lj from result_link_jobs l join result_link_objects x on x.job_id=l.id where l.result_id=r.id and x.source_path=path and l.lease_until>clock_timestamp() and l.lease_token is not null and x.activated_at is not null and x.source_hash is not null limit 1;
 select * into lo from result_link_objects x where x.job_id=lj.id and x.source_path=path;
 if lj.id is not null then
  if lo.source_path<>r.owner_id::text||'/'||r.project_id::text||'/results/'||r.id::text||(case when lo.asset='thumb' then '_t.jpg' when r.output='mp4' then '.mp4' else '.jpg' end) then raise exception '회수 경로 소유권이 달라요';end if;
  if lo.target_path<>r.owner_id::text||'/'||r.project_id::text||'/results/'||r.id::text||'/revoked/'||lj.id::text||(case when lo.asset='thumb' then '/thumb.jpg' when r.output='mp4' then '/file.mp4' else '/file.jpg' end) then raise exception '회수 대상 경로가 달라요';end if;
  if lo.source_path<>(case when lo.asset='file' then r.file_path else r.thumb_path end) or not exists(select 1 from storage.objects where bucket_id='photos' and name=lo.target_path) then raise exception '회수 복사본 확인이 필요해요';end if;
  return;
 end if;
 select * into review from result_retention_reviews where result_id=r.id for share;
 select * into j from result_cleanup_jobs where result_id=r.id for share;
 select * into o from result_cleanup_objects where job_id=j.id and result_cleanup_objects.path=assert_result_storage_delete.path for share;
 if result_cleanup_gate(r.id)<>'READY' or review.version is distinct from j.review_version or j.lease_until<=clock_timestamp() or j.lease_token is null or o.active_token is distinct from j.lease_token or o.status<>'processing' then raise exception '정리 적격 조건이 바뀌었어요' using errcode='42501';end if;
 if o.location='original' and o.path not in(r.file_path,r.thumb_path) then raise exception '파일 경로가 달라요';end if;
 if o.location='rotated' and not exists(select 1 from result_link_objects x join result_link_jobs l on l.id=x.job_id where l.result_id=r.id and l.status='confirmed' and x.target_path=o.path and x.cdn_verified_at is not null) then raise exception '회수 검증이 필요해요';end if;
end $$;
create function guard_result_storage_delete() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if OLD.bucket_id='photos' and OLD.name like '%/results/%' then perform assert_result_storage_delete(OLD.name);end if;return OLD;
end $$;
create trigger cleanup_result_storage_delete before delete on storage.objects for each row execute function guard_result_storage_delete();
revoke all on function assert_result_storage_delete(text) from public,anon,authenticated;

create function finish_result_cleanup(jid uuid,token uuid,outcome text) returns void language plpgsql security definer set search_path=public as $$
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
 update result_cleanup_attempts set code=case when reason<>'READY' then reason when outcome='ABSENT' and is_absent then 'ABSENT_CONFIRMED' else 'DELETE_OR_VERIFY_FAILED' end,finished_at=clock_timestamp(),updated_at=clock_timestamp() where result_cleanup_attempts.token=finish_result_cleanup.token;
 update result_cleanup_jobs set lease_token=null,lease_until=null,
 status=case when reason<>'READY' then 'blocked'
  when title_status='confirmed' and not exists(select 1 from result_cleanup_objects where job_id=jid and status<>'confirmed') then 'confirmed'
  when exists(select 1 from result_cleanup_objects where job_id=jid and status='failed_exhausted') or title_status='failed_exhausted' then 'failed_exhausted' else 'partial' end,
 updated_at=clock_timestamp() where id=jid;
end $$;
revoke all on function cleanup_snapshot(uuid,uuid),claim_result_cleanup(),finish_result_cleanup(uuid,uuid,text) from public,anon,authenticated;
grant execute on function cleanup_snapshot(uuid,uuid),claim_result_cleanup(),finish_result_cleanup(uuid,uuid,text) to service_role;

-- No title, path, token or legal reference in this independent technical status API.
create function my_result_cleanup_status() returns table(result_id uuid,deleted_at timestamptz,kind text,output text,status text,reason text,title_status text,objects jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public as $$
 select r.id,r.deleted_at,r.kind,r.output,
 case when result_cleanup_gate(r.id)<>'READY' and j.status<>'confirmed' then 'blocked' else j.status end,
 case when j.status='confirmed' then 'CONFIRMED' else result_cleanup_gate(r.id) end,j.title_status,
 coalesce((select jsonb_agg(jsonb_build_object('asset',o.asset,'location',o.location,'status',o.status,'auto_attempts',o.auto_attempts,'additional_attempts',greatest(o.auto_attempts-1,0),'next_attempt_at',o.next_attempt_at,'verified_at',o.verified_at,'code',o.last_code) order by o.location,o.asset) from result_cleanup_objects o where o.job_id=j.id),'[]'::jsonb),j.updated_at
 from result_cleanup_jobs j join results r on r.id=j.result_id where r.owner_id=auth.uid() and r.deleted_at is not null order by r.deleted_at desc,r.id;
$$;
revoke all on function my_result_cleanup_status() from public,anon;
grant execute on function my_result_cleanup_status() to authenticated;
notify pgrst,'reload schema';

-- Signed probe URLs serve only the unfinished link verification, never the
-- retained minimal audit. Keep proof times/statuses, discard credential copies.
create function purge_confirmed_link_probe() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.status='confirmed' then update result_link_objects set probe_url=null where job_id=NEW.id;end if;return NEW;
end $$;
create trigger confirmed_link_probe_cleanup after update of status on result_link_jobs for each row execute function purge_confirmed_link_probe();
update result_link_objects x set probe_url=null from result_link_jobs j where x.job_id=j.id and j.status='confirmed';
