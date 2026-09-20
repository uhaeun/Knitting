-- 소식(알림). 좋아요·댓글·팔로우가 생길 때 서버가 알아서 한 줄 쌓는다.
-- 앱이 직접 넣지 않는다 (남의 계정으로 알림을 만들 수 없게).

create type notification_kind as enum ('like', 'comment', 'follow', 'follow_request');

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade, -- 받는 사람
  actor_id   uuid not null references profiles on delete cascade, -- 만든 사람
  kind       notification_kind not null,
  post_id    uuid references posts on delete cascade,
  comment_id uuid references comments on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  check (user_id <> actor_id)
);
create index on notifications (user_id, created_at desc);
create index on notifications (user_id) where read_at is null;

alter table notifications enable row level security;

-- 내 소식만 읽고, 읽음 표시만 고칠 수 있다. 넣기는 트리거(정의자 권한)만 한다
create policy notifications_select on notifications for select using (user_id = (select auth.uid()));
create policy notifications_update on notifications for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on notifications for delete using (user_id = (select auth.uid()));

create or replace function add_notification(
  target uuid, actor uuid, k notification_kind, p uuid default null, c uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if target is null or actor is null or target = actor then
    return; -- 내가 한 일은 나에게 알리지 않는다
  end if;
  -- 차단한 사이면 알리지 않는다
  if exists (
    select 1 from blocks b
    where (b.blocker_id = target and b.blocked_id = actor)
       or (b.blocker_id = actor and b.blocked_id = target)
  ) then
    return;
  end if;
  insert into notifications (user_id, actor_id, kind, post_id, comment_id)
  values (target, actor, k, p, c);
end $$;

create or replace function notify_like() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform add_notification((select owner_id from posts where id = NEW.post_id), NEW.user_id, 'like', NEW.post_id, null);
  return NEW;
end $$;

create or replace function notify_comment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform add_notification((select owner_id from posts where id = NEW.post_id), NEW.author_id, 'comment', NEW.post_id, NEW.id);
  return NEW;
end $$;

create or replace function notify_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform add_notification(
    NEW.followee_id, NEW.follower_id,
    case when NEW.status = 'pending' then 'follow_request'::notification_kind else 'follow'::notification_kind end,
    null, null
  );
  return NEW;
end $$;

create trigger reactions_notify after insert on reactions for each row execute function notify_like();
create trigger comments_notify after insert on comments for each row execute function notify_comment();
create trigger follows_notify after insert on follows for each row execute function notify_follow();

-- 좋아요를 취소하면 그 소식도 지운다 (안 지우면 눌렀다 뗐다로 알림이 쌓인다)
create or replace function unnotify_like() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from notifications
  where kind = 'like' and post_id = OLD.post_id and actor_id = OLD.user_id;
  return OLD;
end $$;
create trigger reactions_unnotify after delete on reactions for each row execute function unnotify_like();

revoke execute on function add_notification(uuid, uuid, notification_kind, uuid, uuid) from anon, authenticated;

/** 모두 읽음 */
create or replace function mark_notifications_read()
returns void language sql security invoker set search_path = public as $$
  update notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null;
$$;
revoke execute on function mark_notifications_read() from anon;
grant execute on function mark_notifications_read() to authenticated;
