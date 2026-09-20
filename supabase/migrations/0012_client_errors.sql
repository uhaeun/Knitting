-- 오류 모니터링. 앱에서 터진 오류를 서버에 모아 둔다 (바깥 서비스에 보내지 않는다).
-- 읽기는 정책을 두지 않는다 → 앱에서는 아무도 못 읽고, 대시보드(Table editor)에서만 본다.

create table client_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles on delete set null,
  message     text not null check (char_length(message) <= 500),
  stack       text check (char_length(stack) <= 4000),
  where_at    text check (char_length(where_at) <= 200),  -- 주소(경로)
  agent       text check (char_length(agent) <= 300),     -- 브라우저·기기
  app         text check (char_length(app) <= 40),        -- 웹 / 앱(ios·android)
  created_at  timestamptz not null default now()
);
create index on client_errors (created_at desc);

alter table client_errors enable row level security;

-- 로그인 여부와 상관없이 남길 수 있다 (로그인 화면에서 터진 오류도 봐야 한다).
-- 남의 것을 읽거나 고칠 수는 없다 (select·update 정책이 아예 없다).
create policy client_errors_insert on client_errors for insert to anon, authenticated with check (true);
