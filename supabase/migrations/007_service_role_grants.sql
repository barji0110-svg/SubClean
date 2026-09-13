-- ============================================================
-- 007: service_role 에 테이블 권한(GRANT) 부여
-- ============================================================
-- 증상: Edge Function 이 "permission denied for table subscriptions" 로 500
--
-- 원인: 005 에서 `authenticated` 에만 GRANT 를 줬다.
--       Edge Function 은 `service_role` 로 접속하는데, 이 역할은
--       **RLS 는 우회하지만 GRANT 는 우회하지 않는다.**
--       즉 005 에서 겪은 것과 같은 벽에 다른 역할로 다시 부딪힌 것이다.
--
-- 보안: service_role 키는 서버(Edge Function 시크릿)에만 있고 브라우저로
--       나가지 않는다. 이 역할에 전체 권한을 주는 건 Supabase 기본 구성이며,
--       사용자 데이터 격리는 `authenticated` 쪽 RLS 가 계속 담당한다.
-- ============================================================

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 앞으로 만들 객체에도 자동 적용 (안 하면 새 테이블마다 같은 일을 또 겪는다)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
