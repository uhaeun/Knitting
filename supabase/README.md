# Supabase

- `migrations/0001_init.sql` — 스키마 + 트리거 + RLS + Storage 정책. 대시보드 SQL Editor에 붙여 실행.
- 인증: 이메일+비밀번호. 대시보드 Authentication → Providers → Email → **Confirm email 끄기** (도그푸딩 중).
- 앱 설정: 루트 `.env`에 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`.env.example` 참고).
- 타입 생성: `npx supabase gen types typescript --project-id <ref> > src/shared/types/database.ts`
