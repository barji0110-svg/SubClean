-- ============================================================
-- 004: 구독 레코드를 클라우드에 온전히 저장할 수 있게 스키마 보강
-- ============================================================
-- 문제 1: CHECK 제약이 앱이 실제로 쓰는 값을 거부한다
--   status      앱: active / cancelling / cancelled / kept
--               DB : trial / active / cancelled / expired / unknown
--               → 'cancelling', 'kept' 저장 시 위반
--   data_source 앱: manual / parse / gmail / seed
--               DB : email / browser_extension / official_api / manual
--               → 'parse', 'gmail', 'seed' 저장 시 위반
--
-- 문제 2: 앱 레코드의 필드 11개가 DB 에 아예 없어서 저장 시 버려진다
--   category · lastPaid · snoozeUntil · notes · evidence · cancelledAt ·
--   lastUsed · steps · rawSnippet · confidence · messageType
--   → 해지 체크리스트 진행도, 메모, Gmail 근거가 기기를 옮기면 사라진다
-- ============================================================

-- ------------------------------------------------------------
-- 1) status CHECK 확대
-- ------------------------------------------------------------
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trial', 'active', 'cancelling', 'cancelled', 'kept', 'expired', 'unknown'));

-- ------------------------------------------------------------
-- 2) data_source CHECK 확대
-- ------------------------------------------------------------
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_data_source_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_data_source_check
  CHECK (data_source IN (
    'email', 'browser_extension', 'official_api', 'manual', 'parse', 'gmail', 'seed'
  ));

-- ------------------------------------------------------------
-- 3) 앱 레코드 필드 추가
-- ------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS last_paid    DATE,
  ADD COLUMN IF NOT EXISTS snooze_until DATE,
  ADD COLUMN IF NOT EXISTS notes        TEXT,
  ADD COLUMN IF NOT EXISTS evidence     TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at DATE,
  ADD COLUMN IF NOT EXISTS last_used    DATE,
  ADD COLUMN IF NOT EXISTS steps        JSONB,
  ADD COLUMN IF NOT EXISTS raw_snippet  TEXT,
  ADD COLUMN IF NOT EXISTS confidence   NUMERIC,
  ADD COLUMN IF NOT EXISTS message_type TEXT;

-- ------------------------------------------------------------
-- 4) 사용자별 조회 인덱스
--    (RLS 가 모든 쿼리에 user_id 조건을 붙이므로 반드시 필요하다)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_user_id ON delivery_orders(user_id);
