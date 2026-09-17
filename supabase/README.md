# Supabase

- `migrations/0001_init.sql` — 스키마 + 트리거 + RLS + Storage 정책. 대시보드 SQL Editor에 붙여 실행.
- `migrations/0002_fix_posts_insert_recursion.sql` — 사진 INSERT 정책 순환 수정. **0001을 이미 적용했어도 실행할 것**
- `migrations/0003_owner_sees_own_deleted_posts.sql` — 사진 soft delete 403 수정. **0002 다음에 실행할 것**
- `migrations/0004_project_rpcs.sql` — 웹용 서버 함수(편물 목록 집계, 공개 범위 변경, 편물 삭제). **0003 다음에 실행할 것**
- `migrations/0005_video_records.sql` — 영상 기록(media_type·video_path·duration_ms, MP4 허용, 10MB). **0004 다음에 실행할 것**
- 인증: 이메일+비밀번호. 대시보드 Authentication → Providers → Email → **Confirm email 끄기** (도그푸딩 중).
- 앱 설정: 루트 `.env`에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`.env.example` 참고).
- RLS 검증: `tests/rls_matrix.sql`을 SQL Editor에 붙여 실행. 마지막 줄이 `ALL PASS`여야 한다 (가시성 10건 + 쓰기 4건 + 서버 함수 5건 + 영상 6건).
  전체가 rollback으로 끝나므로 데이터는 남지 않는다. **개발 프로젝트에서만 실행할 것** (auth.users에 임시 행을 넣는다).
- 타입 생성: `npx supabase gen types typescript --project-id <ref> > src/shared/types/database.ts`
