-- PROJ-022..035. Never conflate DB privacy, origin retirement, CDN verification,
-- or later physical cleanup. Applied predecessors remain unchanged.
create table result_link_jobs (
 id uuid primary key default gen_random_uuid(),
 result_id uuid not null unique references results(id) on delete cascade,
 owner_id uuid not null references profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','retrying','unverified','failed','failed_exhausted','confirmed')),
 auto_attempts int not null default 0 check(auto_attempts between 0 and 6),
 manual_attempts int not null default 0,
 manual_requested boolean not null default false,
 last_manual_at timestamptz,
 next_attempt_at timestamptz default clock_timestamp(),
 lease_token uuid, lease_until timestamptz,
 last_code text,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), deleted_at timestamptz
);
create table result_link_objects (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references result_link_jobs on delete cascade,
 asset text not null check(asset in ('file','thumb')),
 source_path text not null,
 target_path text not null unique,
 source_hash text check(source_hash ~ '^[a-f0-9]{64}$'),
 probe_url text, probe_warmed_at timestamptz, probe_cdn_hit boolean not null default false,
 activated_at timestamptz, removed_at timestamptz,
 origin_blocked_at timestamptz, cdn_verified_at timestamptz,
 last_http_status int, last_code text,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), deleted_at timestamptz,
 unique(job_id,asset)
);
create table result_link_attempts (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references result_link_jobs on delete cascade,
 lease_token uuid not null unique,
 mode text not null check(mode in ('auto','manual')),
 code text, finished_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), deleted_at timestamptz
);
create index result_link_due on result_link_jobs(next_attempt_at) where status<>'confirmed';
alter table result_link_jobs enable row level security;
alter table result_link_objects enable row level security;
alter table result_link_attempts enable row level security;
revoke all on result_link_jobs,result_link_objects,result_link_attempts from public,anon,authenticated;
grant all on result_link_jobs,result_link_objects,result_link_attempts to service_role;

create function enqueue_legacy_link_job(rid uuid) returns void language plpgsql security definer set search_path=public as $$
declare r results; jid uuid;
begin
 select * into r from results where id=rid;
 if not found or not r.legacy_links_unverified then return;end if;
 insert into result_link_jobs(result_id,owner_id)values(r.id,r.owner_id)
 on conflict(result_id) do nothing returning id into jid;
 if jid is null then return;end if;
 insert into result_link_objects(job_id,asset,source_path,target_path)
 values(jid,'file',r.file_path,r.owner_id::text||'/'||r.project_id::text||'/results/'||r.id::text||'/revoked/'||jid::text||(case when r.output='mp4' then '/file.mp4' else '/file.jpg' end)),
       (jid,'thumb',r.thumb_path,r.owner_id::text||'/'||r.project_id::text||'/results/'||r.id::text||'/revoked/'||jid::text||'/thumb.jpg');
end $$;
revoke all on function enqueue_legacy_link_job(uuid) from public,anon,authenticated;
grant execute on function enqueue_legacy_link_job(uuid) to service_role;
create function queue_legacy_link_transition() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.legacy_links_unverified and (NEW.visibility='private' or NEW.deleted_at is not null) then perform enqueue_legacy_link_job(NEW.id);end if;
 return NEW;
end $$;
create trigger results_legacy_link_queue after insert or update of visibility,deleted_at on results
 for each row execute function queue_legacy_link_transition();
-- Backfill only outstanding privacy/deletion obligations; do not rotate public media gratuitously.
select enqueue_legacy_link_job(id) from results where legacy_links_unverified and (visibility='private' or deleted_at is not null);

create function retired_result_path(path text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from result_link_objects where source_path=path);
$$;
revoke all on function retired_result_path(text) from public,anon;
grant execute on function retired_result_path(text) to authenticated,service_role;
grant execute on function lock_active_account(uuid) to service_role;
create function guard_retired_result_upload() returns trigger language plpgsql set search_path=public as $$
begin
 if current_user in ('authenticated','anon') and NEW.bucket_id='photos' and
   (NEW.name like '%/results/%/revoked/%' or retired_result_path(NEW.name)) then
   raise exception '회수한 결과물 주소는 다시 사용할 수 없어요' using errcode='42501';
 end if;
 -- Service copies must participate in the same profile lock as account deletion.
 -- A client role is rejected above; no copied object may appear after deletion begins.
 if NEW.bucket_id='photos' and NEW.name like '%/results/%/revoked/%' and not lock_active_account(split_part(NEW.name,'/',1)::uuid) then
   raise exception '계정을 삭제하는 중에는 복사할 수 없어요' using errcode='42501';end if;
 return NEW;
end $$;
create trigger retired_result_upload before insert or update on storage.objects for each row execute function guard_retired_result_upload();

-- New raw post references must never race a worker's safety check. Historical
-- invalid references block rotation and are not silently rewritten.
create function guard_post_result_reference() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' or NEW.photo_path is distinct from OLD.photo_path or NEW.thumb_path is distinct from OLD.thumb_path or NEW.video_path is distinct from OLD.video_path then
  if NEW.photo_path like '%/results/%' or NEW.thumb_path like '%/results/%' or NEW.video_path like '%/results/%' then
   raise exception '촬영 기록은 결과물 파일을 참조할 수 없어요' using errcode='23514';end if;
 end if;return NEW;
end $$;
create trigger post_result_reference before insert or update on posts for each row execute function guard_post_result_reference();

-- A job lease fences every persisted transition; paths are server-derived and
-- checked against all raw posts and other results before any destructive call.
create function link_job_snapshot(jid uuid,token uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare j result_link_jobs; r results; o result_link_objects; expected text;
begin
 select * into j from result_link_jobs where id=jid for update;
 if j.id is null or j.lease_token is distinct from token or j.lease_until<=clock_timestamp() then
  raise exception '작업 임대가 만료됐어요' using errcode='42501';end if;
 select * into r from results where id=j.result_id;
 if r.owner_id is distinct from j.owner_id or exists(select 1 from profiles where id=j.owner_id and deletion_requested_at is not null) then
  raise exception '계정 상태를 확인해야 해요' using errcode='42501';end if;
 for o in select * from result_link_objects where job_id=jid loop
  expected:=r.owner_id::text||'/'||r.project_id::text||'/results/'||r.id::text||(case when o.asset='thumb' then '_t.jpg' when r.output='mp4' then '.mp4' else '.jpg' end);
  if o.source_path<>expected or o.target_path<>r.owner_id::text||'/'||r.project_id::text||'/results/'||r.id::text||'/revoked/'||jid::text||(case when o.asset='thumb' then '/thumb.jpg' when r.output='mp4' then '/file.mp4' else '/file.jpg' end)
   or exists(select 1 from posts where photo_path in(o.source_path,o.target_path) or thumb_path in(o.source_path,o.target_path) or video_path in(o.source_path,o.target_path))
   or exists(select 1 from results where id<>r.id and (file_path in(o.source_path,o.target_path) or thumb_path in(o.source_path,o.target_path))) then
    raise exception '파일 소유 관계를 확인해야 해요' using errcode='42501';end if;
 end loop;
 update result_link_jobs set lease_until=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp() where id=jid;
 return jsonb_build_object('id',j.id,'result_id',r.id,'owner_id',r.owner_id,'project_id',r.project_id,'token',token,
   'objects',(select jsonb_agg(to_jsonb(x) order by asset) from result_link_objects x where job_id=jid));
end $$;
create function claim_link_revocation() returns jsonb language plpgsql security definer set search_path=public as $$
declare j result_link_jobs; token uuid:=gen_random_uuid();mode text;
begin
 -- Lease loss is a persisted failed attempt, never an unbounded immediate retry.
 update result_link_attempts a set code='LEASE_EXPIRED',finished_at=clock_timestamp(),updated_at=clock_timestamp()
  from result_link_jobs q where a.job_id=q.id and a.finished_at is null and q.lease_until<=clock_timestamp();
 update result_link_jobs set status=case when auto_attempts>=6 then 'failed_exhausted' else 'failed' end,
  last_code='LEASE_EXPIRED',lease_token=null,lease_until=null,
  next_attempt_at=case when auto_attempts>=6 then null else clock_timestamp()+make_interval(secs=>case greatest(1,auto_attempts) when 1 then 60 when 2 then 300 when 3 then 900 when 4 then 3600 else 10800 end) end,
  updated_at=clock_timestamp() where lease_until<=clock_timestamp();
 select * into j from result_link_jobs where status<>'confirmed'
  and (lease_until is null or lease_until<=clock_timestamp())
  and (manual_requested or (auto_attempts<6 and next_attempt_at<=clock_timestamp()))
  order by next_attempt_at nulls last,created_at for update skip locked limit 1;
 if j.id is null then return null;end if;
 -- A crashed last attempt counts as attempted, and its failure remains auditable.
 update result_link_attempts set code='LEASE_EXPIRED',finished_at=clock_timestamp(),updated_at=clock_timestamp()
  where job_id=j.id and finished_at is null;
 mode:=case when j.manual_requested then 'manual' else 'auto' end;
 update result_link_jobs set status='retrying',lease_token=token,lease_until=clock_timestamp()+interval '5 minutes',
  auto_attempts=auto_attempts+case when mode='auto' then 1 else 0 end,
  manual_attempts=manual_attempts+case when mode='manual' then 1 else 0 end,
  manual_requested=false,updated_at=clock_timestamp() where id=j.id;
 insert into result_link_attempts(job_id,lease_token,mode)values(j.id,token,mode);
 -- Return the unsafe manifest too: the worker must persist a sanitized failure
 -- if later safety validation rejects it, rather than rolling back the claim.
 return jsonb_build_object('id',j.id,'token',token);
end $$;
create function record_link_object(jid uuid,token uuid,oid uuid,stage text,digest text default null,probe text default null,http_status int default null,cdn_hit boolean default false,error_code text default null)
 returns void language plpgsql security definer set search_path=public as $$
declare o result_link_objects;
begin
 perform link_job_snapshot(jid,token);
 select * into o from result_link_objects where id=oid and job_id=jid for update;
 if not found then raise exception '작업 객체가 달라요' using errcode='42501';end if;
 if stage='prepared' then
  if digest !~ '^[a-f0-9]{64}$' or digest is null or probe is null or length(probe)>4096 then raise exception '파일 검증이 필요해요';end if;
  if o.source_hash is not null and o.source_hash<>digest then raise exception '원본 파일이 달라졌어요';end if;
  update result_link_objects set source_hash=digest,probe_url=coalesce(probe_url,probe),probe_warmed_at=coalesce(probe_warmed_at,clock_timestamp()),probe_cdn_hit=probe_cdn_hit or cdn_hit where id=oid;
 elsif stage='activated' then
  if o.source_hash is null or not exists(select 1 from storage.objects where bucket_id='photos' and name=o.target_path) then raise exception '새 파일 검증이 필요해요';end if;
  update result_link_objects set activated_at=coalesce(activated_at,clock_timestamp()) where id=oid;
 elsif stage='removed' then
  if o.activated_at is null or exists(select 1 from storage.objects where bucket_id='photos' and name=o.source_path) then raise exception '구경로 제거 확인이 필요해요';end if;
  update result_link_objects set removed_at=coalesce(removed_at,clock_timestamp()) where id=oid;
 elsif stage in ('origin_blocked','cdn_verified') then
  if o.removed_at is null or exists(select 1 from storage.objects where bucket_id='photos' and name=o.source_path) or http_status not in(400,401,403,404,410) then raise exception '접근 차단 증거가 필요해요';end if;
  if stage='cdn_verified' and (not o.probe_cdn_hit or o.probe_warmed_at is null or o.removed_at>clock_timestamp()-interval '65 seconds') then raise exception 'CDN 전파 검증이 필요해요';end if;
  update result_link_objects set origin_blocked_at=coalesce(origin_blocked_at,clock_timestamp()),
   cdn_verified_at=case when stage='cdn_verified' then clock_timestamp() else cdn_verified_at end,
   last_http_status=http_status,last_code=case when stage='cdn_verified' then 'CDN_PROBE_BLOCKED' else 'ORIGIN_BLOCKED_CDN_UNVERIFIED' end where id=oid;
 elsif stage='failed' then
  update result_link_objects set last_code=case when error_code in('STORAGE_ERROR','UNSAFE_PATH','SOURCE_MISSING','DIGEST_MISMATCH','CDN_PENDING','CDN_ACCESSIBLE','CDN_UNVERIFIED','NETWORK_ERROR') then error_code else 'STORAGE_ERROR' end where id=oid;
 else raise exception '알 수 없는 작업 단계예요';end if;
 update result_link_objects set updated_at=clock_timestamp() where id=oid;
end $$;
create function finish_link_revocation(jid uuid,token uuid,code text) returns void language plpgsql security definer set search_path=public as $$
declare j result_link_jobs; mode text; n int; done boolean;
begin
 select * into j from result_link_jobs where id=jid for update;
 if j.id is null or j.lease_token is distinct from token or j.lease_until<=clock_timestamp() then raise exception '작업 임대가 만료됐어요' using errcode='42501';end if;
 if code not in('OK','STORAGE_ERROR','UNSAFE_PATH','SOURCE_MISSING','DIGEST_MISMATCH','CDN_PENDING','CDN_ACCESSIBLE','CDN_UNVERIFIED','NETWORK_ERROR','LEASE_EXPIRED') then code:='STORAGE_ERROR';end if;
 select a.mode into mode from result_link_attempts a where a.lease_token=token;
 select count(*)=2 and bool_and(cdn_verified_at is not null) into done from result_link_objects where job_id=jid;
 -- Do not update the result row while holding the job lock: privacy transitions
 -- lock result -> job. Keeping the same direction avoids a deadlock. Confirmed
 -- job state, not the immutable migration inventory flag, clears the risk DTO.
 n:=greatest(1,j.auto_attempts);
 update result_link_jobs set status=case when done then 'confirmed' when auto_attempts>=6 then 'failed_exhausted'
   when code in('CDN_PENDING','CDN_UNVERIFIED') then 'unverified' else 'failed' end,
  last_code=case when done then 'OK' else code end,
  next_attempt_at=case when done or auto_attempts>=6 then null
   when mode='manual' then next_attempt_at
   else clock_timestamp()+make_interval(secs=>case n when 1 then 60 when 2 then 300 when 3 then 900 when 4 then 3600 else 10800 end) end,
  lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=jid;
 update result_link_attempts set code=case when done then 'OK' else finish_link_revocation.code end,
  finished_at=clock_timestamp(),updated_at=clock_timestamp() where lease_token=token;
end $$;
create function retry_my_link_revocation(rid uuid) returns void language plpgsql security definer set search_path=public as $$
declare j result_link_jobs;
begin
 select * into j from result_link_jobs where result_id=rid and owner_id=auth.uid() for update;
 if not found then raise exception '작업을 찾을 수 없어요' using errcode='P0002';end if;
 if j.status='confirmed' then return;end if;
 if j.lease_until>clock_timestamp() or j.manual_requested then return;end if;
 if j.last_manual_at>clock_timestamp()-interval '10 seconds' then raise exception '잠시 후 다시 시도해 주세요';end if;
 update result_link_jobs set manual_requested=true,last_manual_at=clock_timestamp(),updated_at=clock_timestamp() where id=j.id;
 -- Automatic attempts and their existing due time are deliberately preserved.
end $$;
revoke all on function link_job_snapshot(uuid,uuid),claim_link_revocation(),record_link_object(uuid,uuid,uuid,text,text,text,int,boolean,text),finish_link_revocation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function link_job_snapshot(uuid,uuid),claim_link_revocation(),record_link_object(uuid,uuid,uuid,text,text,text,int,boolean,text),finish_link_revocation(uuid,uuid,text) to service_role;
revoke all on function retry_my_link_revocation(uuid) from public,anon;
grant execute on function retry_my_link_revocation(uuid) to authenticated;

-- Immutable result keys remain the client identity; only the server gateway
-- resolves them to a verified replacement. Original paths can never be reused.
create or replace function result_media_target(rid uuid,viewer uuid,epoch text,asset text)
returns table(path text,output text,owner_id uuid,project_id uuid) language sql stable security definer set search_path=public as $$
 select coalesce(o.target_path,case when result_media_target.asset='file' then r.file_path else r.thumb_path end),
  case when result_media_target.asset='file' then r.output else 'jpeg' end,r.owner_id,r.project_id
 from results r left join result_link_jobs j on j.result_id=r.id
 left join result_link_objects o on o.job_id=j.id and o.asset=result_media_target.asset and o.activated_at is not null
 where r.id=rid and result_media_target.asset in('file','thumb') and r.media_epoch::text=epoch and result_visible_to(rid,viewer);
$$;
drop function my_legacy_link_risks();
create function my_legacy_link_risks() returns table(id uuid,title text,deleted_at timestamptz,kind text,status text,output text,auto_attempts int,manual_attempts int,next_attempt_at timestamptz,last_code text,origin_blocked int,cdn_verified int,objects jsonb)
language sql stable security definer set search_path=public as $$
 select r.id,coalesce(r.display_title_override,r.project_name_snapshot,'이전 결과물'),r.deleted_at,r.kind,
  coalesce(j.status,'unverified'),r.output,coalesce(j.auto_attempts,0),coalesce(j.manual_attempts,0),j.next_attempt_at,j.last_code,
  (select count(*)::int from result_link_objects where job_id=j.id and origin_blocked_at is not null),
  (select count(*)::int from result_link_objects where job_id=j.id and cdn_verified_at is not null),
  coalesce((select jsonb_agg(jsonb_build_object('asset',asset,'origin_blocked',origin_blocked_at is not null,'cdn_verified',cdn_verified_at is not null,'code',last_code) order by asset) from result_link_objects where job_id=j.id),'[]'::jsonb)
 from results r left join result_link_jobs j on j.result_id=r.id
 where r.owner_id=auth.uid() and ((j.id is not null and j.status<>'confirmed') or (j.id is null and r.legacy_links_unverified and(r.visibility='private' or r.deleted_at is not null)))
 order by r.created_at desc,r.id;
$$;
revoke all on function my_legacy_link_risks() from public,anon;
grant execute on function my_legacy_link_risks() to authenticated;
notify pgrst,'reload schema';

-- One statement/snapshot, one JSON envelope: PostgREST's row limit must never
-- truncate the risk count or let pagination races manufacture a safe zero.
create function my_link_risks_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
 with risks as materialized(select * from my_legacy_link_risks())
 select jsonb_build_object('risks',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb),
  'summary',jsonb_build_object('total',count(*),'processing',count(*) filter(where r.status not in('failed','failed_exhausted')),
   'action_needed',count(*) filter(where r.status in('failed','failed_exhausted')),'checked_at',statement_timestamp())) from risks r;
$$;
revoke all on function my_link_risks_snapshot() from public,anon;
grant execute on function my_link_risks_snapshot() to authenticated;
notify pgrst,'reload schema';
