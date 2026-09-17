-- RLS 가시성 검증 매트릭스. 설계도 v1.1 4장의 조합표를 실행 가능한 형태로 고정한다.
-- 정책은 눈으로 검증할 수 없다. 이 파일이 그 역할을 한다.
--
-- 전제: migrations 0001~0004 적용.
-- 실행: Supabase SQL Editor에 통째로 붙여넣는다. 마지막 줄이 ALL PASS여야 한다.
-- 전체가 rollback으로 끝나므로 데이터는 남지 않는다.
-- ⚠️ auth.users에 임시 행을 넣으므로 개발 프로젝트에서만 실행할 것.

begin;

-- 테스트 사용자 4명: A(공개) B(비공개) C(제3자) D(A를 차단함)
create temporary table t_ids (label text primary key, id uuid);
insert into t_ids values
  ('A', '11111111-1111-1111-1111-111111111111'),
  ('B', '22222222-2222-2222-2222-222222222222'),
  ('C', '33333333-3333-3333-3333-333333333333'),
  ('D', '44444444-4444-4444-4444-444444444444');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       lower(label) || '@rls.test', '', now(), now(), now()
from t_ids;

insert into profiles (id, username, display_name, is_private)
select id, 'user_' || lower(label), label, label = 'B' from t_ids;

-- A의 편물: 공개범위별 3건 + 숨김 1 + 삭제 1
insert into projects (id, owner_id, name, default_visibility)
values ('a0000000-0000-4000-8000-000000000001',
        (select id from t_ids where label = 'A'), 'A의 편물', 'public');

insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at, visibility, hidden_at, deleted_at)
values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   (select id from t_ids where label='A'), 'a/1.jpg','a/1_t.jpg',1440,1440, now(), 'private',   null,  null),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   (select id from t_ids where label='A'), 'a/2.jpg','a/2_t.jpg',1440,1440, now(), 'followers', null,  null),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   (select id from t_ids where label='A'), 'a/3.jpg','a/3_t.jpg',1440,1440, now(), 'public',    null,  null),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
   (select id from t_ids where label='A'), 'a/4.jpg','a/4_t.jpg',1440,1440, now(), 'public',    now(), null),
  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001',
   (select id from t_ids where label='A'), 'a/5.jpg','a/5_t.jpg',1440,1440, now(), 'public',    null,  now());

-- B(비공개)의 팔로워 전용 게시물
insert into projects (id, owner_id, name, default_visibility)
values ('b0000000-0000-4000-8000-000000000001',
        (select id from t_ids where label='B'), 'B의 편물', 'followers');
insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at, visibility)
values ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001',
        (select id from t_ids where label='B'), 'b/6.jpg','b/6_t.jpg',1440,1440, now(), 'followers');

-- 관계: C→A 승인 팔로우 / C→B 는 트리거가 pending으로 / D가 A를 차단
insert into follows (follower_id, followee_id, status)
values ((select id from t_ids where label='C'), (select id from t_ids where label='A'), 'accepted');
insert into follows (follower_id, followee_id)
values ((select id from t_ids where label='C'), (select id from t_ids where label='B'));
insert into blocks (blocker_id, blocked_id)
values ((select id from t_ids where label='D'), (select id from t_ids where label='A'));

-- 특정 사용자로 가장해서 게시물이 보이는지 판정
create or replace function pg_temp.visible_as(viewer uuid, post uuid)
returns boolean language plpgsql as $$
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer)::text, true);
  select count(*) into n from posts where id = post;
  perform set_config('role', 'postgres', true);
  return n > 0;
end $$;

-- 특정 사용자로 가장해서 쓰기가 성공하는지 판정 (정책 순환·SELECT 정책 재검사 회귀 방지)
create or replace function pg_temp.writes_as(viewer uuid, stmt text)
returns boolean language plpgsql as $$
declare ok boolean := true;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer)::text, true);
  begin
    execute stmt;
  exception when others then
    ok := false;
  end;
  perform set_config('role', 'postgres', true);
  return ok;
end $$;

create temporary table t_result (no int, 케이스 text, 기대 boolean, 실제 boolean);
insert into t_result values
  (1, 'private 글을 타인(C)이 조회', false,
      pg_temp.visible_as((select id from t_ids where label='C'), 'c0000000-0000-4000-8000-000000000001')),
  (2, 'followers 글을 미팔로워가 조회', false,
      pg_temp.visible_as((select id from t_ids where label='B'), 'c0000000-0000-4000-8000-000000000002')),
  (3, 'followers 글을 승인 팔로워(C)가 조회', true,
      pg_temp.visible_as((select id from t_ids where label='C'), 'c0000000-0000-4000-8000-000000000002')),
  (4, 'pending 상태에서 비공개 계정(B)의 글  ★가장 흔한 버그', false,
      pg_temp.visible_as((select id from t_ids where label='C'), 'c0000000-0000-4000-8000-000000000006')),
  (5, '내가 차단한 사람(D→A)의 public 글', false,
      pg_temp.visible_as((select id from t_ids where label='D'), 'c0000000-0000-4000-8000-000000000003')),
  (6, '차단은 양방향 — A는 D를 차단 안 했지만 D의 차단이 A에게도 걸린다', false,
      pg_temp.visible_as((select id from t_ids where label='A'), 'c0000000-0000-4000-8000-000000000007')),
  (7, '본인의 private 글', true,
      pg_temp.visible_as((select id from t_ids where label='A'), 'c0000000-0000-4000-8000-000000000001')),
  (8, '타인의 public 글', true,
      pg_temp.visible_as((select id from t_ids where label='C'), 'c0000000-0000-4000-8000-000000000003')),
  (9, 'hidden_at 있는 글 (신고 3회 자동 숨김)', false,
      pg_temp.visible_as((select id from t_ids where label='C'), 'c0000000-0000-4000-8000-000000000004')),
  (10,'deleted_at 있는 글', false,
      pg_temp.visible_as((select id from t_ids where label='C'), 'c0000000-0000-4000-8000-000000000005')),
  (11,'본인의 deleted_at 있는 글 (soft delete 갱신에 필요)', true,
      pg_temp.visible_as((select id from t_ids where label='A'), 'c0000000-0000-4000-8000-000000000005')),
  (12,'본인 편물에 게시물 추가 (0002: 정책 순환)', true,
      pg_temp.writes_as((select id from t_ids where label='A'),
        $$insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at)
          values ('c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001',
                  '11111111-1111-1111-1111-111111111111', 'a/12.jpg', 'a/12_t.jpg', 1440, 1440, now())$$)),
  (13,'본인 게시물 soft delete (0003: SELECT 정책 재검사)', true,
      pg_temp.writes_as((select id from t_ids where label='A'),
        $$update posts set deleted_at = now() where id = 'c0000000-0000-4000-8000-000000000001'$$)),
  (14,'타인(C)의 게시물 추가는 거부', false,
      pg_temp.writes_as((select id from t_ids where label='C'),
        $$insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at)
          values ('c0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001',
                  '33333333-3333-3333-3333-333333333333', 'a/14.jpg', 'a/14_t.jpg', 1440, 1440, now())$$));

-- 6번은 D가 만든 public 글이 A에게 보이는지로 확인한다 (차단 방향을 뒤집어 본다)
insert into projects (id, owner_id, name, default_visibility)
values ('d0000000-0000-4000-8000-000000000001',
        (select id from t_ids where label='D'), 'D의 편물', 'public');
insert into posts (id, project_id, owner_id, photo_path, thumb_path, width, height, taken_at, visibility)
values ('c0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001',
        (select id from t_ids where label='D'), 'd/7.jpg','d/7_t.jpg',1440,1440, now(), 'public');
update t_result
set 실제 = pg_temp.visible_as((select id from t_ids where label='A'), 'c0000000-0000-4000-8000-000000000007')
where no = 6;

-- 0004 서버 함수: 권한과 원자성 ---------------------------------
-- A의 편물 사진 상태 (호출 전 스냅샷)
create temporary table t_before as
select id, visibility, deleted_at from posts where project_id = 'a0000000-0000-4000-8000-000000000001';

insert into t_result values
  (15,'타인(C)이 A의 편물 삭제 함수 호출은 거부', false,
      pg_temp.writes_as((select id from t_ids where label='C'),
        $$select soft_delete_project('a0000000-0000-4000-8000-000000000001')$$)),
  (16,'타인(C)이 A의 편물 공개 범위 함수 호출은 거부', false,
      pg_temp.writes_as((select id from t_ids where label='C'),
        $$select set_project_visibility('a0000000-0000-4000-8000-000000000001', 'private')$$));
insert into t_result values
  (17,'거부된 호출은 A의 사진을 하나도 바꾸지 않는다', true,
      not exists (
        (select id, visibility, deleted_at from posts where project_id = 'a0000000-0000-4000-8000-000000000001'
         except select * from t_before)
        union all
        (select * from t_before
         except select id, visibility, deleted_at from posts where project_id = 'a0000000-0000-4000-8000-000000000001')));
insert into t_result values
  (18,'본인(A) 편물 삭제 함수는 성공', true,
      pg_temp.writes_as((select id from t_ids where label='A'),
        $$select soft_delete_project('a0000000-0000-4000-8000-000000000001')$$));
insert into t_result values
  (19,'삭제 후 A의 편물·사진이 모두 deleted_at', true,
      (select deleted_at is not null from projects where id = 'a0000000-0000-4000-8000-000000000001')
      and not exists (select 1 from posts where project_id = 'a0000000-0000-4000-8000-000000000001' and deleted_at is null));

-- 트리거 검증도 함께
create temporary table t_trigger (항목 text, 기대 text, 실제 text);
insert into t_trigger
select '비공개 계정 팔로우는 pending', 'pending',
       (select status::text from follows
        where follower_id = (select id from t_ids where label='C')
          and followee_id = (select id from t_ids where label='B'));
insert into t_trigger
select '공개 계정 팔로우는 accepted', 'accepted',
       (select status::text from follows
        where follower_id = (select id from t_ids where label='C')
          and followee_id = (select id from t_ids where label='A'));

-- 결과 -------------------------------------------------------------
select no, 케이스, 기대, 실제, (기대 = 실제) as pass from t_result order by no;
select 항목, 기대, 실제, (기대 = 실제) as pass from t_trigger;

select
  (select count(*) from t_result  where 기대 is distinct from 실제)
+ (select count(*) from t_trigger where 기대 is distinct from 실제) as 실패건수,
  case when (select count(*) from t_result  where 기대 is distinct from 실제)
          + (select count(*) from t_trigger where 기대 is distinct from 실제) = 0
       then 'ALL PASS' else 'FAIL — 위 표에서 pass=false 행을 볼 것' end as 결과;

rollback;
