alter table profiles add column deletion_requested_at timestamptz;
create table account_deletion_jobs (
 owner_id uuid primary key,
 status text not null check(status in ('processing','failed','completed')),
 lease_token uuid,lease_until timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz
);
alter table account_deletion_jobs enable row level security;
revoke all on account_deletion_jobs from public,anon,authenticated;

create function lock_active_account(target uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from profiles where id=target and deleted_at is null and deletion_requested_at is null for share;
 return found;
end $$;
revoke all on function lock_active_account(uuid) from public;
grant execute on function lock_active_account(uuid) to authenticated;
create function reject_pending_account_write() returns trigger
language plpgsql set search_path=public as $$
declare uid uuid;
begin
 if current_user='authenticated' then
   uid:=auth.uid();
   if not lock_active_account(uid) then raise exception '계정을 삭제하는 중이에요' using errcode='42501';end if;
 end if;
 return NEW;
end $$;
create trigger projects_account_active before insert or update on projects for each row execute function reject_pending_account_write();
create trigger posts_account_active before insert or update on posts for each row execute function reject_pending_account_write();
create trigger results_account_active before insert or update on results for each row execute function reject_pending_account_write();
create trigger storage_account_active before insert or update on storage.objects for each row execute function reject_pending_account_write();
create function guard_profile_deletion() returns trigger language plpgsql set search_path=public as $$
begin
 if OLD.deletion_requested_at is not null and NEW.username<>OLD.username then
   raise exception '계정을 삭제하는 중에는 아이디를 바꿀 수 없어요' using errcode='42501';
 end if;
 if current_user='authenticated' and (OLD.deletion_requested_at is not null or NEW.deletion_requested_at is distinct from OLD.deletion_requested_at) then
   raise exception '계정 삭제 상태는 서버에서 관리해요' using errcode='42501';
 end if;
 return NEW;
end $$;
create trigger profile_deletion_guard before update on profiles for each row execute function guard_profile_deletion();
create or replace function account_allows_media(target uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p where p.id=target and p.deleted_at is null and p.deletion_requested_at is null
   and not is_blocked_pair(target,auth.uid())
   and (target=auth.uid() or not p.is_private or is_accepted_follower(auth.uid(),target)));
$$;

create function begin_account_deletion(target uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare token uuid:=gen_random_uuid();job account_deletion_jobs;
begin
 insert into account_deletion_jobs(owner_id,status)values(target,'failed')on conflict do nothing;
 select * into job from account_deletion_jobs where owner_id=target for update;
 if job.status='completed' then return null;end if;
 if job.status='processing' and job.lease_until>clock_timestamp() then raise exception '이미 삭제 중이에요' using errcode='55P03';end if;
 update profiles set deletion_requested_at=coalesce(deletion_requested_at,now()) where id=target;
 if not found then raise exception '계정을 찾을 수 없어요' using errcode='P0002';end if;
 update account_deletion_jobs set status='processing',lease_token=token,lease_until=clock_timestamp()+interval '5 minutes',updated_at=now() where owner_id=target;
 return token;
end $$;
create function account_deletion_objects(target uuid,token uuid) returns table(bucket_id text,name text)
language plpgsql security definer set search_path=public,storage as $$
begin
 if not exists(select 1 from public.account_deletion_jobs where owner_id=target and lease_token=token and status='processing' and lease_until>clock_timestamp()) then
   raise exception '삭제 작업을 다시 확인해 주세요' using errcode='42501';end if;
 return query select o.bucket_id,o.name from storage.objects o where o.bucket_id in ('photos','avatars') and (storage.foldername(o.name))[1]=target::text order by o.bucket_id,o.name limit 500;
end $$;
create function fail_account_deletion(target uuid,token uuid) returns void
language sql security definer set search_path=public as $$
 update account_deletion_jobs set status='failed',lease_token=null,lease_until=null,updated_at=now() where owner_id=target and lease_token=token;
$$;
create function finish_account_deletion(target uuid,token uuid) returns void
language plpgsql security definer set search_path=public,auth,storage as $$
begin
 perform 1 from public.account_deletion_jobs where owner_id=target and lease_token=token and status='processing' and lease_until>clock_timestamp() for update;
 if not found then raise exception '삭제 작업을 다시 확인해 주세요' using errcode='42501';end if;
 if exists(select 1 from storage.objects o where o.bucket_id in ('photos','avatars') and (storage.foldername(o.name))[1]=target::text) then
   raise exception '아직 정리하지 못한 파일이 있어요' using errcode='P0001';end if;
 delete from auth.users where id=target;
 update public.account_deletion_jobs set status='completed',lease_token=null,lease_until=null,updated_at=now() where owner_id=target;
end $$;
revoke all on function begin_account_deletion(uuid),account_deletion_objects(uuid,uuid),fail_account_deletion(uuid,uuid),finish_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function begin_account_deletion(uuid),account_deletion_objects(uuid,uuid),fail_account_deletion(uuid,uuid),finish_account_deletion(uuid,uuid) to service_role;
-- The old client-callable function must never bypass server file verification.
revoke all on function delete_my_account() from public,anon,authenticated;
notify pgrst,'reload schema';
