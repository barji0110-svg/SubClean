-- ============================================================
-- 006: 웹 푸시 구독 저장
-- ============================================================
-- 왜 필요한가:
--   지금 알림은 브라우저 Notification API 직접 호출이라 **앱이 열려 있을 때만** 뜬다.
--   (Dashboard.jsx, gmailImport.js) 그런데 이 앱의 핵심 가치는
--   "결제 전에 알려줘서 해지할 기회를 주는 것"이다. 앱을 열어야 알림이 온다면
--   그 가치가 성립하지 않는다 — 열어볼 사람은 알림 없이도 확인한다.
--
--   서버가 앱 밖으로 알림을 보내려면 브라우저가 발급한 푸시 엔드포인트와
--   암호화 키를 보관해야 한다. 그 저장소가 이 테이블이다.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 브라우저가 발급하는 푸시 서비스 주소. 기기·브라우저마다 다르고 이게 곧 식별자다.
  endpoint    TEXT NOT NULL,

  -- 페이로드 암호화용 키 (PushSubscription.getKey)
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,

  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  last_sent_at TIMESTAMPTZ,

  -- 같은 기기에서 다시 구독하면 갱신되도록 (재설치·권한 재허용 시 중복 방지)
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ------------------------------------------------------------
-- RLS: 자기 구독만
-- ------------------------------------------------------------
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_push_select" ON push_subscriptions;
CREATE POLICY "users_own_push_select"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_push_insert" ON push_subscriptions;
CREATE POLICY "users_own_push_insert"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_push_update" ON push_subscriptions;
CREATE POLICY "users_own_push_update"
  ON push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_push_delete" ON push_subscriptions;
CREATE POLICY "users_own_push_delete"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- GRANT: RLS 만으로는 부족하다. 005 에서 겪은 그 문제.
--   GRANT 가 없으면 "permission denied for table" 이 나고 RLS 까지 가지도 못한다.
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE push_subscriptions TO authenticated;

-- ------------------------------------------------------------
-- 알림 발송 이력 — 같은 구독에 같은 날 중복 발송하지 않기 위한 기록
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID,
  kind            TEXT NOT NULL,     -- 'D-3' | 'D-1' | 'D-DAY'
  sent_on         DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, subscription_id, kind, sent_on)
);

CREATE INDEX IF NOT EXISTS idx_push_log_user_id ON push_log(user_id);

ALTER TABLE push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_push_log_select" ON push_log;
CREATE POLICY "users_own_push_log_select"
  ON push_log FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT ON TABLE push_log TO authenticated;
-- 쓰기는 Edge Function 이 service_role 로 한다 (RLS·GRANT 우회)
