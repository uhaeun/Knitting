# Supabase

- `migrations/0001_init.sql` — 스키마 + 트리거 + RLS + Storage 정책. 대시보드 SQL Editor에 붙여 실행.
- 인증: 이메일+비밀번호. 대시보드 Authentication → Providers → Email → **Confirm email 끄기** (도그푸딩 중).
- 앱 설정: 루트 `.env`에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`.env.example` 참고).
- RLS 검증: `tests/rls_matrix.sql`을 SQL Editor에 붙여 실행. 마지막 줄이 `ALL PASS`여야 한다.
  전체가 rollback으로 끝나므로 데이터는 남지 않는다. **개발 프로젝트에서만 실행할 것** (auth.users에 임시 행을 넣는다).
- 타입 생성: `npx supabase gen types typescript --project-id <ref> > src/shared/types/database.ts`
