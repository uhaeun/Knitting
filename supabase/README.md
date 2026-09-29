# Supabase

Auth·PostgreSQL RLS·Storage가 기록의 원본이다. 클라이언트에는 URL과 anon 공개 키만 넣는다. 운영과 로컬 시험 서버를 구분한다.

## 마이그레이션

현재 `migrations/0001`부터 `0014`까지 있다. 새 환경에는 파일명 순서로 적용한다. 적용된 파일은 수정하거나 전체를 재실행하지 않고 새 번호를 추가한다.

- 0001~0004: 초기 스키마·RLS, 정책 순환과 soft delete 수정, 편물 서버 함수.
- 0005~0012: 영상, 계정 삭제, 프로필 사진, 휴지통, 소식, 댓글, 순서 변경, 오류 수집.
- 0013: 발행 결과물과 일상 사진 숨김.
- 0014: 0013 정책 순환 수정, 결과물 소유권·비공개·삭제 권한 보강.

운영 0013·0014는 2026-09-29 한 트랜잭션으로 적용했다. 0013만 적용한 상태로 새 기능을 서비스하지 않는다. [적용 기록](../docs/개발_QA_점검_20260929.md).

## 로컬·CI

Docker와 `psql`이 필요하다. 설정은 `config.toml`, 새 환경 준비 기준은 [E2E 워크플로](../.github/workflows/e2e.yml)의 “로컬 Supabase 띄우기” 단계다. 파일을 잠시 치운 뒤 명시적으로 순서대로 적용한다. 기존 DB에 그 준비 과정을 반복하지 않는다.

```bash
npx supabase status
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/rls_matrix.sql
```

권한 검사는 임시 계정·행을 만들고 전체를 rollback한다. **로컬·개발 DB에서만 실행한다.** 현재 본검사 42개와 추가검사 3개이며 실패하면 SQL 예외를 던진다.

E2E 웹은 `http://localhost:8098`, 로컬 API는 `http://127.0.0.1:54321`이다. 서버 시작 시 로컬 URL·anon 키를 명시해 `.env`의 운영 설정을 사용하지 않도록 한다. 영상 파일 검사에는 로컬 service-role 키가 필요하다.

## 인증

운영 이메일 인증을 일괄 비활성화하지 않는다. 현재 SMTP·인증 활성화·복귀 URL 설정을 먼저 확인하고 실제 수신·인증·재설정을 검증한다. 과거 도그푸딩 설정을 공개 서비스의 완료 상태로 간주하지 않는다.

타입 재생성이 필요하면 대상 개발 프로젝트를 확인한 뒤 실행한다.

```bash
npx supabase gen types typescript --project-id <개발-프로젝트-ref> > src/shared/types/database.ts
```
