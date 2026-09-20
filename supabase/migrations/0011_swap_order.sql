-- 기록 순서 바꾸기. 타임라인 순서는 taken_at으로 정해지므로 이웃한 두 기록의 시각을 맞바꾼다.
-- 한 번에 바꿔야 중간에 실패해 순서가 꼬이지 않는다.

create or replace function swap_post_order(a uuid, b uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  ta timestamptz;
  tb timestamptz;
  owner_a uuid;
  owner_b uuid;
begin
  select taken_at, owner_id into ta, owner_a from posts where id = a and deleted_at is null;
  select taken_at, owner_id into tb, owner_b from posts where id = b and deleted_at is null;
  if ta is null or tb is null then
    raise exception '기록을 찾을 수 없어요' using errcode = 'P0002';
  end if;
  if owner_a <> (select auth.uid()) or owner_b <> (select auth.uid()) then
    raise exception '내 기록만 옮길 수 있어요' using errcode = 'P0001';
  end if;
  update posts set taken_at = tb, updated_at = now() where id = a;
  update posts set taken_at = ta, updated_at = now() where id = b;
end $$;

revoke execute on function swap_post_order(uuid, uuid) from anon;
grant execute on function swap_post_order(uuid, uuid) to authenticated;
