-- posts INSERT가 "infinite recursion detected in policy for relation posts"로 실패하던 문제.
-- posts_insert → projects 조회 → projects_select → posts 조회로 정책이 순환했다.
-- 0001의 원칙대로 판정을 security definer 함수로 옮겨 정책 본문에서 서브쿼리를 없앤다.

create or replace function is_project_owner(pid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = pid and owner_id = uid);
$$;

drop policy if exists posts_insert on posts;
create policy posts_insert on posts for insert with check (
  owner_id = (select auth.uid())
  and is_project_owner(project_id, (select auth.uid()))
);
