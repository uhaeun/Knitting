-- 대댓글과 댓글 수정.
-- 답글은 한 단계만 (답글의 답글은 같은 줄에 달린다). 수정은 글쓴이만.

alter table comments add column parent_id uuid references comments on delete cascade;
alter table comments add column edited_at timestamptz;
create index on comments (parent_id) where deleted_at is null;

-- 답글의 답글을 막는다 (한 단계만 유지)
create or replace function comments_depth_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.parent_id is not null and exists (
    select 1 from comments c where c.id = NEW.parent_id and c.parent_id is not null
  ) then
    raise exception '답글에는 답글을 달 수 없어요' using errcode = 'P0001';
  end if;
  return NEW;
end $$;
create trigger comments_depth before insert on comments for each row execute function comments_depth_guard();

-- 답글도 게시물 주인에게 알린다 (원 댓글 글쓴이에게도)
create or replace function notify_comment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform add_notification((select owner_id from posts where id = NEW.post_id), NEW.author_id, 'comment', NEW.post_id, NEW.id);
  if NEW.parent_id is not null then
    perform add_notification((select author_id from comments where id = NEW.parent_id), NEW.author_id, 'comment', NEW.post_id, NEW.id);
  end if;
  return NEW;
end $$;

-- 수정은 글쓴이만. 본문이 바뀌면 edited_at을 찍는다
create or replace function comments_touch_edited() returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.body is distinct from OLD.body then
    NEW.edited_at = now();
  end if;
  return NEW;
end $$;
create trigger comments_edited before update on comments for each row execute function comments_touch_edited();

drop policy if exists comments_update on comments;
create policy comments_update on comments for update
  using (author_id = (select auth.uid()) or exists (select 1 from posts p where p.id = comments.post_id and p.owner_id = (select auth.uid())))
  with check (author_id = (select auth.uid()) or exists (select 1 from posts p where p.id = comments.post_id and p.owner_id = (select auth.uid())));
