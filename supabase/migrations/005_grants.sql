-- ============================================================
-- 005: authenticated 역할에 테이블 권한(GRANT) 부여
-- ============================================================
-- 증상: 로그인은 되고 조회도 되는데, 구독을 저장하려 하면
--       "permission denied for table subscriptions"
--
-- 원인: Postgres 는 접근을 **두 층**으로 통제한다.
--
--   ① GRANT — 이 역할이 이 테이블에 무엇을 할 수 있나 (테이블 단위)
--   ② RLS   — 할 수 있다면, 어떤 '행'까지인가 (행 단위)
--
--   002 에서 RLS 정책은 만들었지만 GRANT 는 준 적이 없다.
--   RLS 가 아무리 잘 짜여 있어도 GRANT 가 없으면 테이블에 닿지도 못한다.
--
--   이걸 여태 못 잡은 이유: SQL Editor 쿼리는 `postgres` 역할로 실행되어
--   GRANT 와 RLS 를 **둘 다 우회**한다. 대시보드에서 되는 걸 확인해도
--   앱이 쓰는 `authenticated` 역할의 권한은 검증되지 않는다.
--
-- 보안: 이 GRANT 는 울타리를 넓히지 않는다.
--   RLS 가 켜져 있는 한 `authenticated` 는 여전히 `auth.uid() = user_id` 인
--   자기 행만 볼 수 있다. GRANT 는 "테이블에 접근 가능", RLS 가 "내 행만".
--   두 층이 모두 있어야 정상 동작한다.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 사용자 소유 데이터 — 읽기/쓰기 (행 제한은 RLS 가 담당)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  subscriptions,
  subscription_events,
  transactions,
  delivery_orders,
  service_connections
TO authenticated;

-- 서비스 카탈로그 — 기준 데이터라 읽기 전용
GRANT SELECT ON TABLE service_catalog TO authenticated;

-- service_catalog.id 는 GENERATED ALWAYS AS IDENTITY 이므로
-- 혹시 쓰기 권한을 줄 일이 생기면 시퀀스 권한도 함께 필요하다 (지금은 읽기 전용).

-- ------------------------------------------------------------
-- 앞으로 만들 테이블에도 자동 적용되도록 기본 권한을 설정한다.
-- (이게 없으면 새 테이블마다 같은 문제를 다시 겪는다)
-- ------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
