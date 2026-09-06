-- Knitting 닛팅 — 초기 스키마. 출처: docs/닛팅_설계도_v1.1.html 3~5장.
-- 적용: Supabase 대시보드 SQL Editor에 통째로 붙여 실행하거나 `supabase db push`.

create extension if not exists "pgcrypto";

create type follow_status as enum ('pending', 'accepted');
create type visibility as enum ('private', 'followers', 'public');
create type reaction_kind as enum ('like', 'cheer');
create type report_target as enum ('post', 'comment', 'profile');
create type report_status as enum ('open', 'actioned', 'dismissed');

-- 프로필 --------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text not null check (char_length(display_name) between 1 and 30),
  bio           text check (char_length(bio) <= 150),
  avatar_path   text,
  is_private    boolean not null default false,
  eula_version  int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- 편물 프로젝트 --------------------------------------------
create table projects (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references profiles on delete cascade,
  name               text not null check (char_length(name) between 1 and 50),
  cover_post_id      uuid,
  started_at         date not null default current_date,
  finished_at        date,
  default_visibility visibility not null default 'private',
  reminder_enabled   boolean not null default false,
  reminder_time      time,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index on projects (owner_id, created_at desc) where deleted_at is null;

-- 게시물 (기록 1건 = 사진 1장) --------------------------------
create table posts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects on delete cascade,
  owner_id      uuid not null references profiles on delete cascade,
  photo_path    text not null,   -- Storage 키. 'photos' 버킷 내 경로
  thumb_path    text not null,
  width         int not null,
  height        int not null,
  caption       text check (char_length(caption) <= 500),
  taken_at      timestamptz not null,
  visibility    visibility not null default 'private',
  align_hint    jsonb,
  like_count    int not null default 0,
  comment_count int not null default 0,
  hidden_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
alter table projects
  add constraint projects_cover_fk foreign key (cover_post_id) references posts(id) on delete set null;
create index on posts (project_id, taken_at, created_at) where deleted_at is null;
create index on posts (created_at desc) where deleted_at is null and hidden_at is null and visibility = 'public';
create index on posts (like_count desc, created_at desc) where deleted_at is null and hidden_at is null and visibility = 'public';
create index on posts (owner_id, created_at desc) where deleted_at is null and hidden_at is null;

-- 관계 ------------------------------------------------------
create table follows (
  follower_id uuid not null references profiles on delete cascade,
  followee_id uuid not null references profiles on delete cascade,
  status      follow_status not null default 'accepted',
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index on follows (followee_id, status);

create table blocks (
  blocker_id uuid not null references profiles on delete cascade,
  blocked_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index on blocks (blocked_id, blocker_id);

-- 상호작용 --------------------------------------------------
create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts on delete cascade,
  author_id  uuid not null references profiles on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  hidden_at  timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on comments (post_id, created_at) where deleted_at is null;

create table reactions (
  post_id    uuid not null references posts on delete cascade,
  user_id    uuid not null references profiles on delete cascade,
  kind       reaction_kind not null default 'like',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 안전 ------------------------------------------------------
create table reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles on delete cascade,
  target_type report_target not null,
  target_id   uuid not null,
  reason      text not null,
  status      report_status not null default 'open',
  created_at  timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index on reports (status, created_at);

-- ==========================================================
-- 트리거
-- ==========================================================
create or replace function bump_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update posts set like_count = like_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set like_count = greatest(like_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end $$;
create trigger reactions_count after insert or delete on reactions
  for each row execute function bump_like_count();

-- 댓글은 soft delete → deleted_at이 채워질 때도 감소
create or replace function bump_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' and NEW.deleted_at is null then
    update posts set comment_count = comment_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' and OLD.deleted_at is null then
    update posts set comment_count = greatest(comment_count - 1, 0) where id = OLD.post_id;
  elsif TG_OP = 'UPDATE' and OLD.deleted_at is null and NEW.deleted_at is not null then
    update posts set comment_count = greatest(comment_count - 1, 0) where id = NEW.post_id;
  end if;
  return null;
end $$;
create trigger comments_count after insert or update or delete on comments
  for each row execute function bump_comment_count();

-- 신고 3회 자동 숨김: 24시간 내 사람 대응이 불가능한 구간의 안전장치
create or replace function auto_hide_on_reports()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from reports
    where target_type = NEW.target_type and target_id = NEW.target_id and status = 'open';
  if n >= 3 then
    if NEW.target_type = 'post' then
      update posts set hidden_at = now() where id = NEW.target_id and hidden_at is null;
    elsif NEW.target_type = 'comment' then
      update comments set hidden_at = now() where id = NEW.target_id and hidden_at is null;
    end if;
  end if;
  return null;
end $$;
create trigger reports_auto_hide after insert on reports
  for each row execute function auto_hide_on_reports();

-- 팔로우 요청: 대상이 비공개면 pending, 공개면 accepted. 클라이언트가 status를 정하지 못한다.
create or replace function set_follow_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare priv boolean;
begin
  select is_private into priv from profiles where id = NEW.followee_id;
  NEW.status := case when coalesce(priv, false) then 'pending'::follow_status else 'accepted'::follow_status end;
  return NEW;
end $$;
create trigger follows_set_status before insert on follows
  for each row execute function set_follow_status();

-- 차단하면 양방향 팔로우를 끊는다
create or replace function unfollow_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from follows
    where (follower_id = NEW.blocker_id and followee_id = NEW.blocked_id)
       or (follower_id = NEW.blocked_id and followee_id = NEW.blocker_id);
  return null;
end $$;
create trigger blocks_unfollow after insert on blocks
  for each row execute function unfollow_on_block();

-- updated_at 자동 갱신
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return NEW; end $$;
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();
create trigger projects_touch before update on projects for each row execute function touch_updated_at();
create trigger posts_touch    before update on posts    for each row execute function touch_updated_at();

-- ==========================================================
-- RLS
-- ==========================================================
alter table profiles  enable row level security;
alter table projects  enable row level security;
alter table posts     enable row level security;
alter table follows   enable row level security;
alter table blocks    enable row level security;
alter table comments  enable row level security;
alter table reactions enable row level security;
alter table reports   enable row level security;

-- 판정 함수: stable + security definer. 정책 본문에 서브쿼리를 두지 않는다.
create or replace function is_blocked_pair(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function is_accepted_follower(viewer uuid, target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from follows
    where follower_id = viewer and followee_id = target and status = 'accepted'
  );
$$;

-- profiles
create policy profiles_select on profiles for select using (
  deleted_at is null
  and not is_blocked_pair(id, (select auth.uid()))
  and (id = (select auth.uid()) or is_private = false or is_accepted_follower((select auth.uid()), id))
);
create policy profiles_insert on profiles for insert with check (id = (select auth.uid()));
create policy profiles_update on profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- projects: 본인 것 전부. 타인 것은 보이는 게시물이 하나라도 있을 때 (posts 정책이 상속됨)
create policy projects_select on projects for select using (
  owner_id = (select auth.uid())
  or (deleted_at is null and exists (select 1 from posts p where p.project_id = projects.id))
);
create policy projects_insert on projects for insert with check (owner_id = (select auth.uid()));
create policy projects_update on projects for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy projects_delete on projects for delete using (owner_id = (select auth.uid()));

-- posts
create policy posts_select on posts for select using (
  deleted_at is null
  and hidden_at is null
  and not is_blocked_pair(owner_id, (select auth.uid()))
  and (
    owner_id = (select auth.uid())
    or visibility = 'public'
    or (visibility = 'followers' and is_accepted_follower((select auth.uid()), owner_id))
  )
);
create policy posts_insert on posts for insert with check (
  owner_id = (select auth.uid())
  and exists (select 1 from projects p where p.id = project_id and p.owner_id = (select auth.uid()))
);
create policy posts_update on posts for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy posts_delete on posts for delete using (owner_id = (select auth.uid()));

-- follows: 나와 관련된 행만. status는 트리거가 정한다
create policy follows_select on follows for select using (
  follower_id = (select auth.uid()) or followee_id = (select auth.uid())
);
create policy follows_insert on follows for insert with check (
  follower_id = (select auth.uid()) and not is_blocked_pair(follower_id, followee_id)
);
create policy follows_update on follows for update  -- 승인: 대상만
  using (followee_id = (select auth.uid())) with check (followee_id = (select auth.uid()));
create policy follows_delete on follows for delete using (
  follower_id = (select auth.uid()) or followee_id = (select auth.uid())
);

-- blocks: 차단한 사람만 본다
create policy blocks_select on blocks for select using (blocker_id = (select auth.uid()));
create policy blocks_insert on blocks for insert with check (blocker_id = (select auth.uid()));
create policy blocks_delete on blocks for delete using (blocker_id = (select auth.uid()));

-- comments: 부모 게시물이 보이면 보인다 (posts 정책 상속)
create policy comments_select on comments for select using (
  deleted_at is null
  and hidden_at is null
  and not is_blocked_pair(author_id, (select auth.uid()))
  and exists (select 1 from posts p where p.id = post_id)
);
create policy comments_insert on comments for insert with check (
  author_id = (select auth.uid()) and exists (select 1 from posts p where p.id = post_id)
);
create policy comments_update on comments for update  -- soft delete: 작성자 또는 게시물 소유자
  using (author_id = (select auth.uid())
         or exists (select 1 from posts p where p.id = post_id and p.owner_id = (select auth.uid())));
create policy comments_delete on comments for delete using (
  author_id = (select auth.uid())
  or exists (select 1 from posts p where p.id = post_id and p.owner_id = (select auth.uid()))
);

-- reactions
create policy reactions_select on reactions for select using (exists (select 1 from posts p where p.id = post_id));
create policy reactions_insert on reactions for insert with check (
  user_id = (select auth.uid()) and exists (select 1 from posts p where p.id = post_id)
);
create policy reactions_delete on reactions for delete using (user_id = (select auth.uid()));

-- reports: 신고자는 자기 신고만 본다. 처리 상태 변경은 대시보드(service role)에서
create policy reports_select on reports for select using (reporter_id = (select auth.uid()));
create policy reports_insert on reports for insert with check (reporter_id = (select auth.uid()));

-- ==========================================================
-- Storage: photos 버킷 (private). 경로 photos/{owner_id}/{project_id}/{post_id}.jpg
-- ==========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- 읽기(서명 URL 발급 포함): 본인 폴더이거나, 그 파일을 쓰는 게시물이 보일 때 (posts 정책 상속)
create policy photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.posts p where p.photo_path = name or p.thumb_path = name)
    )
  );
