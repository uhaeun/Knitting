# 닛팅 (Knitting)

뜨개 편물을 같은 각도로 찍어 쌓고, 성장 영상과 결과 사진(전체 · 전후 · 3분할)을 만드는 웹앱.
Expo(react-native-web) + TypeScript + Supabase.

## 켜기

1. `npm install`
2. `.env` 만들기 (`.env.example` 참고): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. `npm run web -- --port 8099` → http://localhost:8099 (VS Code에서는 Tasks → **닛팅 웹 켜기**)

Supabase 설정은 [supabase/README.md](supabase/README.md).

## 빌드

`npm run build` → `dist/`를 정적 호스팅에 올린다. 모든 경로를 `index.html`로 돌리고, 카메라 때문에 HTTPS가 필요하다.

## 테스트

- 단위: `npm test`
- RLS·서버 함수: `supabase/tests/rls_matrix.sql` (마지막 줄 `ALL PASS`)

## 문서

- [CLAUDE.md](CLAUDE.md) — 개발 규칙 (웹 전환 결정 포함)
- [docs/MVP_상태.md](docs/MVP_상태.md) — 되는 것, 확인한 것, 한계
