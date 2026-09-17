-- posts soft delete(deleted_at 설정)가 403 "new row violates row-level security policy"로 실패하던 문제.
-- Postgres는 UPDATE 결과 행이 SELECT 정책도 통과해야 한다. posts_select가 deleted_at·hidden_at 행을
-- 소유자에게도 숨겨서, 소유자가 자기 글을 지우는(또는 삭제 상태로 upsert하는) 순간 거부됐다.
-- 소유자는 자기 행을 상태와 무관하게 볼 수 있게 한다. 타인 조건(삭제·숨김·차단·공개범위)은 그대로다.
-- 목록 쿼리는 이미 .is('deleted_at', null)로 걸러 읽는다.

drop policy if exists posts_select on posts;
create policy posts_select on posts for select using (
  owner_id = (select auth.uid())
  or (
    deleted_at is null
    and hidden_at is null
    and not is_blocked_pair(owner_id, (select auth.uid()))
    and (
      visibility = 'public'
      or (visibility = 'followers' and is_accepted_follower((select auth.uid()), owner_id))
    )
  )
);
