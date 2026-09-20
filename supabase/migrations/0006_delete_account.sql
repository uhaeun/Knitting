-- 계정 삭제. 지금까지는 메일로 요청해야 했다 (개인정보처리방침의 삭제 약속을 앱이 직접 지키게 한다).
-- auth.users 한 줄을 지우면 profiles → projects → posts → comments·reactions·follows·blocks·reports가
-- 모두 on delete cascade로 함께 사라진다. Storage 파일은 앱이 부르기 전에 먼저 지운다.

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function delete_my_account() from anon;
grant execute on function delete_my_account() to authenticated;
