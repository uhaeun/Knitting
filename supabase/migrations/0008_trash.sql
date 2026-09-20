-- 휴지통. 지운 편물·기록을 되돌린다.
-- 지우기는 계속 soft delete다 (deleted_at). 여기서는 되돌리기와 "완전히 지우기"만 서버 함수로 둔다.
-- 편물을 되돌릴 때는 그때 같이 지워진 기록만 함께 살린다 (그 전에 따로 지운 기록은 그대로 둔다).

create or replace function restore_project(pid uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  removed_at timestamptz;
begin
  select deleted_at into removed_at from projects
  where id = pid and owner_id = (select auth.uid()) and deleted_at is not null;
  if removed_at is null then
    raise exception '되돌릴 편물을 찾을 수 없어요' using errcode = 'P0002';
  end if;

  update posts set deleted_at = null, updated_at = now()
  where project_id = pid and owner_id = (select auth.uid())
    and deleted_at between removed_at - interval '2 seconds' and removed_at + interval '2 seconds';

  update projects set deleted_at = null, updated_at = now() where id = pid;
end $$;

create or replace function restore_post(post_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  owner_project uuid;
begin
  select project_id into owner_project from posts
  where id = post_id and owner_id = (select auth.uid()) and deleted_at is not null;
  if owner_project is null then
    raise exception '되돌릴 기록을 찾을 수 없어요' using errcode = 'P0002';
  end if;
  -- 편물이 지워진 상태면 기록만 살려도 보이지 않는다
  if exists (select 1 from projects where id = owner_project and deleted_at is not null) then
    raise exception '편물을 먼저 되돌려 주세요' using errcode = 'P0002';
  end if;
  update posts set deleted_at = null, updated_at = now() where id = post_id;
end $$;

revoke execute on function restore_project(uuid) from anon;
revoke execute on function restore_post(uuid) from anon;
grant execute on function restore_project(uuid) to authenticated;
grant execute on function restore_post(uuid) to authenticated;

-- 지운 편물도 주인은 볼 수 있어야 휴지통에 나온다 (기록은 0003에서 이미 허용)
drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (
  owner_id = (select auth.uid())
  or (deleted_at is null and exists (select 1 from posts p where p.project_id = projects.id))
);
