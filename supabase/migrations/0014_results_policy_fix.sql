-- 0013의 posts → projects → posts 정책 순환을 끊고 기존 soft delete 동작을 유지한다.
-- 상태 확인만 SECURITY DEFINER로 격리한다. 행의 실제 가시성은 각 테이블 RLS가 판정한다.
create or replace function project_allows_media(pid uuid, daily_photo boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects where id = pid and deleted_at is null
      and (not daily_photo or not photos_hidden_from_others)
  );
$$;
revoke all on function project_allows_media(uuid, boolean) from public;
grant execute on function project_allows_media(uuid, boolean) to authenticated;

drop policy if exists posts_select on posts;
create policy posts_select on posts for select to authenticated using (
  owner_id = (select auth.uid())
  or (
    deleted_at is null and hidden_at is null
    and project_allows_media(project_id, true)
    and not is_blocked_pair(owner_id, (select auth.uid()))
    and (visibility = 'public'
      or (visibility = 'followers' and is_accepted_follower((select auth.uid()), owner_id)))
  )
);

drop policy if exists results_select on results;
create policy results_select on results for select to authenticated using (
  owner_id = (select auth.uid())
  or (
    deleted_at is null and project_allows_media(project_id, false)
    and not is_blocked_pair(owner_id, (select auth.uid()))
    and (visibility = 'public'
      or (visibility = 'followers' and is_accepted_follower((select auth.uid()), owner_id)))
  )
);

drop policy if exists results_insert on results;
create policy results_insert on results for insert to authenticated with check (
  owner_id = (select auth.uid())
  and is_project_owner(project_id, (select auth.uid()))
  and project_allows_media(project_id, false)
);
drop policy if exists results_update on results;
create policy results_update on results for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and is_project_owner(project_id, (select auth.uid())));

-- 공개 범위를 줄였을 때 이미 발행한 결과물이 계속 공개되지 않게 함께 변경한다.
create or replace function set_project_visibility(pid uuid, v visibility)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update projects set default_visibility = v, updated_at = now()
  where id = pid and owner_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception '편물을 찾을 수 없어요' using errcode = 'P0002';
  end if;
  update posts set visibility = v, updated_at = now()
  where project_id = pid and deleted_at is null;
  update results set visibility = v, updated_at = now()
  where project_id = pid and deleted_at is null;
end $$;

revoke all on function set_photos_hidden_from_others(uuid, boolean) from public;
grant execute on function set_photos_hidden_from_others(uuid, boolean) to authenticated;
revoke all on function project_summaries() from public;
grant execute on function project_summaries() to authenticated;

notify pgrst, 'reload schema';
