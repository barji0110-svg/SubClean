-- RLS 정책: 각 사용자는 자신의 데이터만 접근 가능

-- subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_subscriptions_select"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_subscriptions_insert"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_subscriptions_update"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_subscriptions_delete"
  ON subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- subscription_events
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_events_select"
  ON subscription_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_events_insert"
  ON subscription_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_events_update"
  ON subscription_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_events_delete"
  ON subscription_events FOR DELETE
  USING (auth.uid() = user_id);

-- transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_transactions_select"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_transactions_insert"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_transactions_update"
  ON transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_transactions_delete"
  ON transactions FOR DELETE
  USING (auth.uid() = user_id);

-- delivery_orders
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_delivery_select"
  ON delivery_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_delivery_insert"
  ON delivery_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_delivery_update"
  ON delivery_orders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_delivery_delete"
  ON delivery_orders FOR DELETE
  USING (auth.uid() = user_id);

-- service_connections
ALTER TABLE service_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_connections_select"
  ON service_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_connections_insert"
  ON service_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_connections_update"
  ON service_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_connections_delete"
  ON service_connections FOR DELETE
  USING (auth.uid() = user_id);

-- service_catalog (읽기 전용, 모든 인증된 사용자)
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_catalog"
  ON service_catalog FOR SELECT
  USING (auth.role() = 'authenticated');

-- Edge Functions에서 사용할 서비스 계정용 정책
CREATE POLICY "service_role_all_subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role');