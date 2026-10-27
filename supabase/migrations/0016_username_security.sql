-- Reauthentication is checked by change-username Edge Function. Its DB capability
-- is service-only; neither a client flag nor a recently issued JWT is proof.
alter table profiles add column last_username_changed_at timestamptz;
-- Validate explicit name writes, without preventing unrelated operations on an
-- unknown malformed legacy name (in particular the right to delete an account).
create function guard_display_name() returns trigger language plpgsql as $$
begin
 if char_length(btrim(NEW.display_name)) not between 1 and 30 or NEW.display_name !~ '[^[:space:]]' then
   raise exception '표시 이름은 공백을 제외하고 1~30자예요' using errcode='23514';
 end if;
 return NEW;
end $$;
create trigger profiles_display_name before insert or update of display_name on profiles for each row execute function guard_display_name();
create table username_reservations (
 username text primary key check(username ~ '^[a-z0-9_]{3,20}$'),
 previous_owner_id uuid references profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
alter table username_reservations enable row level security;
revoke all on username_reservations from public,anon,authenticated;

create function username_is_reserved(value text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from username_reservations where username=value);
$$;
revoke all on function username_is_reserved(text) from public;
grant execute on function username_is_reserved(text) to authenticated,service_role;
create function guard_username_write() returns trigger
language plpgsql set search_path=public as $$
begin
 if TG_OP='UPDATE' and current_user in ('authenticated','anon') and
   (NEW.username is distinct from OLD.username or
    NEW.last_username_changed_at is distinct from OLD.last_username_changed_at) then
   raise exception '현재 비밀번호를 확인한 뒤 아이디를 변경해 주세요' using errcode='42501';
 end if;
 if TG_OP='INSERT' or NEW.username is distinct from OLD.username then
   perform pg_advisory_xact_lock(hashtextextended('username:'||NEW.username,0));
   if username_is_reserved(NEW.username) then
     raise exception '사용할 수 없는 아이디예요' using errcode='23505';
   end if;
 end if;
 return NEW;
end $$;
create trigger profiles_username before insert or update on profiles for each row execute function guard_username_write();

create function change_username_verified(target uuid,next_username text) returns profiles
language plpgsql security definer set search_path=public as $$
declare p profiles;key text;changed_at timestamptz:=clock_timestamp();
begin
 if next_username !~ '^[a-z0-9_]{3,20}$' or next_username is null then
   raise exception '영문 소문자·숫자·밑줄 3~20자' using errcode='23514';
 end if;
 select * into p from profiles where id=target and deleted_at is null for update;
 if not found then raise exception '프로필을 찾을 수 없어요' using errcode='P0002'; end if;
 if p.username=next_username then return p; end if;
 if p.last_username_changed_at is not null and changed_at<p.last_username_changed_at+interval '720 hours' then
   raise exception '마지막 아이디 변경 후 30일이 지나야 해요' using errcode='P0001';
 end if;
 for key in select value from unnest(array[p.username,next_username]) value order by value loop
   perform pg_advisory_xact_lock(hashtextextended('username:'||key,0));
 end loop;
 if username_is_reserved(next_username) or exists(select 1 from profiles where username=next_username and id<>target) then
   raise exception '사용할 수 없는 아이디예요' using errcode='23505';
 end if;
 insert into username_reservations(username,previous_owner_id)values(p.username,target);
 update profiles set username=next_username,last_username_changed_at=changed_at where id=target returning * into p;
 return p;
end $$;
revoke all on function change_username_verified(uuid,text) from public,anon,authenticated;
grant execute on function change_username_verified(uuid,text) to service_role;
notify pgrst,'reload schema';
