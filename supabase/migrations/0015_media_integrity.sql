-- P0: project ownership, account privacy and atomic soft-delete/restore.
-- No storage deletion and no reinterpretation of historical deletion timestamps.
alter table projects add column deletion_batch_id uuid;
alter table posts add column project_deletion_batch_id uuid;
alter table results add column project_name_snapshot text;
alter table results add column display_title_override text
  check (display_title_override is null or (char_length(btrim(display_title_override)) between 1 and 50));

create function account_allows_media(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from profiles p where p.id=target and p.deleted_at is null
   and not is_blocked_pair(target,auth.uid())
   and (target=auth.uid() or not p.is_private or is_accepted_follower(auth.uid(),target)));
$$;
revoke all on function account_allows_media(uuid) from public;
grant execute on function account_allows_media(uuid) to authenticated;

create function media_project_access(pid uuid, daily boolean) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from projects p where p.id=pid
   and (not daily or (p.deleted_at is null and not p.photos_hidden_from_others)));
$$;
revoke all on function media_project_access(uuid,boolean) from public;
grant execute on function media_project_access(uuid,boolean) to authenticated;

-- Also bound reads by the active project's current visibility. This protects legacy
-- inconsistent rows and a concurrent stale publication while the write guard is deployed.
create function project_visibility_allows(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from projects p where p.id=pid and (
   p.owner_id=auth.uid() or p.deleted_at is not null or p.default_visibility='public'
   or (p.default_visibility='followers' and is_accepted_follower(auth.uid(),p.owner_id))));
$$;
revoke all on function project_visibility_allows(uuid) from public;
grant execute on function project_visibility_allows(uuid) to authenticated;

drop policy posts_select on posts;
create policy posts_select on posts for select to authenticated using (
 owner_id=auth.uid() or (deleted_at is null and hidden_at is null
 and account_allows_media(owner_id) and media_project_access(project_id,true)
 and project_visibility_allows(project_id)
 and (visibility='public' or (visibility='followers' and is_accepted_follower(auth.uid(),owner_id)))));

drop policy results_select on results;
create policy results_select on results for select to authenticated using (
 deleted_at is null and (owner_id=auth.uid() or (account_allows_media(owner_id)
 and media_project_access(project_id,false) and project_visibility_allows(project_id)
 and (visibility='public' or (visibility='followers' and is_accepted_follower(auth.uid(),owner_id))))));

drop policy posts_update on posts;
create policy posts_update on posts for update to authenticated
 using(owner_id=auth.uid()) with check(owner_id=auth.uid() and is_project_owner(project_id,auth.uid()));
drop policy results_update on results;
create policy results_update on results for update to authenticated
 using(owner_id=auth.uid() and deleted_at is null)
 with check(owner_id=auth.uid() and deleted_at is null and is_project_owner(project_id,auth.uid()));

-- A post/result keeps its project and owner for its entire lifetime. On INSERT,
-- lock the parent in the same order used by project RPCs and inherit its latest scope.
create function guard_media_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare p projects;
begin
 if TG_OP='UPDATE' then
   if NEW.owner_id<>OLD.owner_id or NEW.project_id<>OLD.project_id or NEW.id<>OLD.id then
     raise exception '기록의 소유자와 편물은 바꿀 수 없어요' using errcode='23514';
   end if;
   if TG_TABLE_NAME='results' then
     if NEW.file_path<>OLD.file_path or NEW.thumb_path<>OLD.thumb_path or NEW.created_at<>OLD.created_at
        or NEW.project_name_snapshot is distinct from OLD.project_name_snapshot then
       raise exception '발행 원본은 바꿀 수 없어요' using errcode='23514';
     end if;
   end if;
 else
   select * into p from projects where id=NEW.project_id for update;
   if p.id is null or p.owner_id<>NEW.owner_id or p.deleted_at is not null then
     raise exception '기록을 추가할 편물을 찾을 수 없어요' using errcode='23514';
   end if;
   NEW.visibility:=p.default_visibility;
   if TG_TABLE_NAME='results' then NEW.project_name_snapshot:=p.name; end if;
 end if;
 return NEW;
end $$;
create trigger posts_integrity before insert or update on posts for each row execute function guard_media_write();
create trigger results_integrity before insert or update on results for each row execute function guard_media_write();

-- Only the checked server RPCs may perform sensitive state transitions. These
-- guards are SECURITY INVOKER, so a definer RPC is distinct from a direct API write.
create function guard_project_transition() returns trigger
language plpgsql set search_path = public as $$
begin
 if NEW.owner_id<>OLD.owner_id or NEW.id<>OLD.id then
   raise exception '편물의 소유자는 바꿀 수 없어요' using errcode='23514';
 end if;
 if current_user in ('authenticated','anon') and (
   NEW.default_visibility is distinct from OLD.default_visibility or
   NEW.deleted_at is distinct from OLD.deleted_at or
   NEW.deletion_batch_id is distinct from OLD.deletion_batch_id) then
   raise exception '편물 전용 변경 기능을 이용해 주세요' using errcode='42501';
 end if;
 return NEW;
end $$;
create trigger projects_transition before update on projects for each row execute function guard_project_transition();

create function guard_result_transition() returns trigger
language plpgsql set search_path = public as $$
begin
 if current_user in ('authenticated','anon') then
   if NEW.deleted_at is distinct from OLD.deleted_at or NEW.visibility is distinct from OLD.visibility then
     raise exception '결과물 전용 변경 기능을 이용해 주세요' using errcode='42501';
   end if;
 end if;
 if OLD.deleted_at is not null then
   raise exception '삭제한 결과물은 복원하거나 수정할 수 없어요' using errcode='23514';
 end if;
 return NEW;
end $$;
create trigger results_transition before update on results for each row execute function guard_result_transition();

create function guard_post_transition() returns trigger
language plpgsql set search_path = public as $$
begin
 if current_user in ('authenticated','anon') and (
   NEW.visibility is distinct from OLD.visibility or
   NEW.project_deletion_batch_id is distinct from OLD.project_deletion_batch_id or
   (OLD.deleted_at is not null and NEW.deleted_at is null)) then
   raise exception '기록 전용 변경 기능을 이용해 주세요' using errcode='42501';
 end if;
 return NEW;
end $$;
create trigger posts_transition before update on posts for each row execute function guard_post_transition();

create or replace function set_project_visibility(pid uuid,v visibility) returns void
language plpgsql security definer set search_path = public as $$
begin
 perform 1 from projects where id=pid and owner_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception '편물을 찾을 수 없어요' using errcode='P0002'; end if;
 update projects set default_visibility=v where id=pid;
 update posts set visibility=v where project_id=pid and deleted_at is null;
 update results set visibility=v where project_id=pid and deleted_at is null;
end $$;
create or replace function soft_delete_project(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare batch uuid:=gen_random_uuid();
begin
 perform 1 from projects where id=pid and owner_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception '편물을 찾을 수 없어요' using errcode='P0002'; end if;
 update projects set deleted_at=now(),deletion_batch_id=batch where id=pid;
 update posts set deleted_at=now(),project_deletion_batch_id=batch where project_id=pid and deleted_at is null;
 -- Published results deliberately remain intact and retain their scopes.
end $$;
create or replace function restore_project(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare batch uuid;
begin
 select deletion_batch_id into batch from projects where id=pid and owner_id=auth.uid() and deleted_at is not null for update;
 if not found then raise exception '되돌릴 편물을 찾을 수 없어요' using errcode='P0002'; end if;
 update projects set deleted_at=null,default_visibility='private',deletion_batch_id=null where id=pid;
 update posts set deleted_at=null,visibility='private',project_deletion_batch_id=null
   where project_id=pid and owner_id=auth.uid() and project_deletion_batch_id=batch and batch is not null;
 update results set visibility='private' where project_id=pid and deleted_at is null;
 -- Legacy records without a batch remain deleted: never guess from a time window.
end $$;
create or replace function restore_post(post_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p projects;
begin
 select pr.* into p from projects pr join posts x on x.project_id=pr.id
   where x.id=post_id and x.owner_id=auth.uid() and pr.owner_id=auth.uid() and pr.deleted_at is null for update of pr;
 if not found then raise exception '편물을 먼저 되돌려 주세요' using errcode='P0002'; end if;
 update posts set deleted_at=null,visibility=p.default_visibility,project_deletion_batch_id=null
   where id=post_id and owner_id=auth.uid() and deleted_at is not null;
 if not found then raise exception '되돌릴 기록을 찾을 수 없어요' using errcode='P0002'; end if;
end $$;
create function delete_result(result_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
 update results set deleted_at=now() where id=result_id and owner_id=auth.uid() and deleted_at is null;
 if not found then raise exception '결과물을 찾을 수 없어요' using errcode='P0002'; end if;
end $$;
create function set_result_visibility(result_id uuid,v visibility) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
 select project_id into pid from results where id=result_id and owner_id=auth.uid() and deleted_at is null;
 perform 1 from projects where id=pid and owner_id=auth.uid() and deleted_at is not null for update;
 if not found then raise exception '활성 편물의 공개 범위는 편물에서 바꿔 주세요' using errcode='P0002'; end if;
 update results set visibility=v where id=result_id and owner_id=auth.uid() and deleted_at is null;
 if not found then raise exception '결과물을 찾을 수 없어요' using errcode='P0002'; end if;
end $$;
revoke all on function set_project_visibility(uuid,visibility),soft_delete_project(uuid),restore_project(uuid),restore_post(uuid),delete_result(uuid),set_result_visibility(uuid,visibility) from public,anon;
grant execute on function set_project_visibility(uuid,visibility),soft_delete_project(uuid),restore_project(uuid),restore_post(uuid),delete_result(uuid),set_result_visibility(uuid,visibility) to authenticated;
revoke delete on projects,posts,results from anon,authenticated;

create function is_result_object(object_name text) returns boolean
language sql stable security definer set search_path=public as $$
 select object_name like '%/results/%' or exists(select 1 from results where file_path=object_name or thumb_path=object_name);
$$;
revoke all on function is_result_object(text) from public;
grant execute on function is_result_object(text) to authenticated;
drop policy photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated using (
 bucket_id='photos' and (
 ((storage.foldername(name))[1]=auth.uid()::text and not is_result_object(name))
 or exists(select 1 from public.posts p where p.owner_id::text=(storage.foldername(name))[1]
   and (p.photo_path=name or p.thumb_path=name or p.video_path=name))
 or exists(select 1 from public.results r where r.owner_id::text=(storage.foldername(name))[1]
   and (r.file_path=name or r.thumb_path=name))));
notify pgrst,'reload schema';
