-- ============================================================
-- SubClean: 통합 구독 관리 서비스 DB 스키마
-- ============================================================

-- 1. 서비스 카탈로그 (변경 불가 기준 데이터)
CREATE TABLE IF NOT EXISTS service_catalog (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_key   TEXT UNIQUE NOT NULL,
  service_name  TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('membership', 'media', 'ai_subscription', 'delivery', 'ott', 'music', 'productivity', 'cloud', 'design', 'education', 'game', 'news', 'life', 'etc')),
  icon          TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. 사용자 구독 정보
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id          BIGINT REFERENCES service_catalog(id),
  plan_name           TEXT,
  price               NUMERIC(10,2),
  currency            TEXT DEFAULT 'KRW',
  billing_cycle       TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  status              TEXT DEFAULT 'active' CHECK (status IN ('trial', 'active', 'cancelled', 'expired', 'unknown')),
  next_billing_date   DATE,
  trial_end_date      DATE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  data_source         TEXT DEFAULT 'manual' CHECK (data_source IN ('email', 'browser_extension', 'official_api', 'manual')),
  last_synced_at      TIMESTAMPTZ,
  sync_status         TEXT DEFAULT 'pending' CHECK (sync_status IN ('success', 'pending', 'failed')),
  last_sync_error     TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- 3. 구독 이벤트 (결제/체험/해지 등)
CREATE TABLE IF NOT EXISTS subscription_events (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL CHECK (event_type IN (
    'trial_started', 'trial_ending', 'trial_ended',
    'subscription_started', 'payment_scheduled', 'payment_completed',
    'payment_failed', 'subscription_renewed', 'subscription_cancelled', 'refund'
  )),
  event_date        DATE,
  amount            NUMERIC(10,2),
  currency          TEXT DEFAULT 'KRW',
  email_message_id  TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 4. 거래 내역
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id        BIGINT REFERENCES service_catalog(id),
  transaction_type  TEXT NOT NULL CHECK (transaction_type IN ('subscription', 'delivery', 'purchase', 'refund')),
  amount            NUMERIC(10,2),
  currency          TEXT DEFAULT 'KRW',
  paid_at           DATE,
  source            TEXT DEFAULT 'manual',
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 5. 배달의민족 주문 내역
CREATE TABLE IF NOT EXISTS delivery_orders (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ordered_at        TIMESTAMPTZ,
  restaurant_name   TEXT,
  order_amount      NUMERIC(10,2),
  delivery_fee      NUMERIC(10,2) DEFAULT 0,
  discount_amount   NUMERIC(10,2) DEFAULT 0,
  payment_amount    NUMERIC(10,2),
  source            TEXT DEFAULT 'manual',
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 6. 외부 서비스 연결 정보
CREATE TABLE IF NOT EXISTS service_connections (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  connection_type     TEXT DEFAULT 'oauth',
  status              TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked')),
  external_account_id TEXT,
  access_token        TEXT,
  refresh_token       TEXT,
  expires_at          TIMESTAMPTZ,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_service_connections_updated_at
  BEFORE UPDATE ON service_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 초기 서비스 카탈로그 데이터
INSERT INTO service_catalog (service_key, service_name, category, icon) VALUES
  ('naver_membership', '네이버 멤버십', 'membership', 'N'),
  ('coupang_wow', '쿠팡 와우 멤버십', 'membership', 'C'),
  ('youtube_premium', 'YouTube Premium', 'media', 'Y'),
  ('chatgpt', 'ChatGPT', 'ai_subscription', 'G'),
  ('claude', 'Claude', 'ai_subscription', 'C'),
  ('gemini', 'Gemini', 'ai_subscription', 'G'),
  ('baemin', '배달의민족', 'delivery', 'B')
ON CONFLICT (service_key) DO NOTHING;