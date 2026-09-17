-- 웹이 쓰는 편물 단위 서버 함수. 앱은 로컬 DB + 동기화를 쓰므로 영향 없음.
-- 모두 security invoker: 호출자 권한으로 돌고 RLS가 그대로 걸린다. 함수 하나 = 트랜잭션 하나.

-- 편물 목록 + 사진 수 + 표지 썸네일 키. 클라이언트에서 사진 행을 전부 읽어 세면
-- PostgREST 행 제한(기본 1000)에 걸려 사진 수가 잘린다.
create or replace function project_summaries()
returns table (
  id uuid,
  name text,
  cover_post_id uuid,
  started_at date,
  finished_at date,
  default_visibility visibility,
  created_at timestamptz,
  updated_at timestamptz,
  photo_count bigint,
  cover_thumb_path text
)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.cover_post_id, p.started_at, p.finished_at, p.default_visibility,
         p.created_at, p.updated_at,
         (select count(*) from posts x where x.project_id = p.id and x.deleted_at is null),
         (select x.thumb_path from posts x
           where x.project_id = p.id and x.deleted_at is null
           order by x.taken_at desc, x.created_at desc limit 1)
  from projects p
  where p.owner_id = (select auth.uid()) and p.deleted_at is null
  order by p.created_at desc;
$$;

-- 공개 범위 변경: 편물과 사진을 한 번에. 내 편물이 아니면 예외.
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
end $$;

-- 편물 soft delete: 편물과 사진을 한 번에. Storage 파일은 남긴다 (복구 여지).
create or replace function soft_delete_project(pid uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update posts set deleted_at = now(), updated_at = now()
  where project_id = pid and owner_id = (select auth.uid()) and deleted_at is null;
  update projects set deleted_at = now(), updated_at = now()
  where id = pid and owner_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception '편물을 찾을 수 없어요' using errcode = 'P0002';
  end if;
end $$;

revoke execute on function project_summaries() from anon;
revoke execute on function set_project_visibility(uuid, visibility) from anon;
revoke execute on function soft_delete_project(uuid) from anon;
