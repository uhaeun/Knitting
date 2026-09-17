# 닛팅 (Knitting)

뜨개 편물을 같은 각도로 찍어 쌓고, 성장 영상과 결과 사진(전체 · 전후 · 3분할)을 만드는 웹앱.
Expo(react-native-web) + TypeScript + Supabase.

## 켜기

1. `npm install`
2. `.env` 만들기 (`.env.example` 참고): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. `npm run web -- --port 8099` → http://localhost:8099 (VS Code에서는 Tasks → **닛팅 웹 켜기**)

Supabase 설정은 [supabase/README.md](supabase/README.md).

## 빌드

운영: **https://knitting-pied.vercel.app** (Vercel 프로젝트 `knitting`)

- 배포: `npx vercel deploy --prod` — Vercel 서버가 `npx expo export -p web`으로 빌드한다 (`vercel.json`)
- Supabase URL·공개 키는 Vercel 환경변수에 등록돼 있다. 바꾸면 `npx vercel env add … --force` 후 다시 배포
- 모든 경로를 `index.html`로 돌린다(SPA). 카메라 때문에 HTTPS가 필요하다

## 테스트

- 단위: `npm test`
- RLS·서버 함수: `supabase/tests/rls_matrix.sql` (마지막 줄 `ALL PASS`)

## 문서

- [CLAUDE.md](CLAUDE.md) — 개발 규칙 (웹 전환 결정 포함)
- [docs/MVP_상태.md](docs/MVP_상태.md) — 되는 것, 확인한 것, 한계
