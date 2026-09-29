-- 결과물(results) 피드 발행 + 편물 단위 "일상 사진 숨기기".
-- 지금까지 결과 사진·영상(composeResult.ts)은 브라우저 안에서만 만들어지고 서버엔 남지 않았다.
-- 남기고 싶은 결과물만 골라 피드에 올릴 수 있게 별도 테이블로 둔다 (posts와 섞지 않는다 — 좋아요·댓글 등
-- 게시물 상호작용은 이번 범위에 넣지 않았다).

create table results (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  owner_id   uuid not null references profiles on delete cascade,
  kind       text not null check (kind in ('single', 'beforeAfter', 'triple')),
  ratio      text not null check (ratio in ('1:1', '4:5', '9:16', '16:9')),
  output     text not null check (output in ('jpeg', 'mp4')),
  file_path  text not null,   -- Storage 키. 'photos' 버킷의 {owner}/{project}/results/{id}.jpg|.mp4
  thumb_path text not null,   -- 대표 이미지. 영상이어도 항상 JPEG (composeResult.ts의 posterBlob)
  visibility visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on results (owner_id, created_at desc) where deleted_at is null;
create index on results (created_at desc) where deleted_at is null and visibility = 'public';
create trigger results_touch before update on results for each row execute function touch_updated_at();

alter table results enable row level security;

-- posts_select와 같은 판정 (본인 · public · 승인된 팔로워). 좋아요·댓글이 없어 차단 판정만 상속
create policy results_select on results for select using (
  deleted_at is null
  and not is_blocked_pair(owner_id, (select auth.uid()))
  and (
    owner_id = (select auth.uid())
    or visibility = 'public'
    or (visibility = 'followers' and is_accepted_follower((select auth.uid()), owner_id))
  )
);
create policy results_insert on results for insert with check (
  owner_id = (select auth.uid())
  and exists (select 1 from projects p where p.id = project_id and p.owner_id = (select auth.uid()))
);
create policy results_update on results for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy results_delete on results for delete using (owner_id = (select auth.uid()));

-- Storage: photos 버킷 읽기 정책에 results도 포함 (0005가 posts만 넣어 뒀다)
drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.posts p
        where (p.photo_path = name or p.thumb_path = name or p.video_path = name)
          and p.owner_id::text = (storage.foldername(name))[1]
      )
      or exists (
        select 1 from public.results r
        where (r.file_path = name or r.thumb_path = name)
          and r.owner_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- 편물 단위로 "일상 사진은 남에게 숨기고, 발행한 결과물만 보이게" 할 수 있다.
-- 본인은 항상 자기 사진을 본다 — 숨기는 대상은 다른 사람뿐이다. 결과물(results)은 이 값과 무관하다.
alter table projects add column photos_hidden_from_others boolean not null default false;

drop policy if exists posts_select on posts;
create policy posts_select on posts for select using (
  deleted_at is null
  and hidden_at is null
  and not is_blocked_pair(owner_id, (select auth.uid()))
  and (
    owner_id = (select auth.uid())
    or (
      not exists (select 1 from projects pr where pr.id = posts.project_id and pr.photos_hidden_from_others)
      and (
        visibility = 'public'
        or (visibility = 'followers' and is_accepted_follower((select auth.uid()), owner_id))
      )
    )
  )
);

-- 사진을 숨긴 편물이라도, 그 편물에 남이 볼 수 있는 결과물이 있으면 편물 자체는 보여야 한다
-- (안 그러면 결과물을 봐도 편물 화면에 못 들어간다). posts와 같은 원리, results 쪽만 추가
drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (
  owner_id = (select auth.uid())
  or (deleted_at is null and exists (select 1 from posts p where p.project_id = projects.id))
  or (deleted_at is null and exists (select 1 from results r where r.project_id = projects.id))
);

-- project_summaries()에 photos_hidden_from_others 추가 (0004). 반환 열이 늘어 재정의 전에 drop 필요
drop function if exists project_summaries();
create function project_summaries()
returns table (
  id uuid,
  name text,
  cover_post_id uuid,
  started_at date,
  finished_at date,
  default_visibility visibility,
  photos_hidden_from_others boolean,
  created_at timestamptz,
  updated_at timestamptz,
  photo_count bigint,
  cover_thumb_path text
)
language sql stable security invoker set search_path = public as $$
  select p.id, p.name, p.cover_post_id, p.started_at, p.finished_at, p.default_visibility,
         p.photos_hidden_from_others, p.created_at, p.updated_at,
         (select count(*) from posts x where x.project_id = p.id and x.deleted_at is null),
         (select x.thumb_path from posts x
           where x.project_id = p.id and x.deleted_at is null
           order by x.taken_at desc, x.created_at desc limit 1)
  from projects p
  where p.owner_id = (select auth.uid()) and p.deleted_at is null
  order by p.created_at desc;
$$;

-- 사진 숨기기 켜고 끄기. 본인만 (RLS와 별개로 명시적 권한 확인)
create function set_photos_hidden_from_others(pid uuid, hidden boolean)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update projects set photos_hidden_from_others = hidden, updated_at = now()
  where id = pid and owner_id = (select auth.uid());
  if not found then
    raise exception '권한이 없어요' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function set_photos_hidden_from_others(uuid, boolean) from anon;
