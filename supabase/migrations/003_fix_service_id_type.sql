-- ============================================================
-- 003: service_id 타입 정정 (BIGINT → TEXT)
-- ============================================================
-- 문제:
--   001 에서 subscriptions.service_id / transactions.service_id 를
--   BIGINT REFERENCES service_catalog(id) 로 만들었는데,
--   앱은 'netflix', 'claude', 'youtubepremium' 같은 **문자열 키**를 넣는다
--   (src/data/services.js 의 id, src/lib/db.js 의 service_id).
--   → BIGINT 컬럼에 문자열 → invalid input syntax for type bigint → INSERT 실패
--
-- 해결:
--   컬럼을 TEXT 로 바꾸고 외래키는 걸지 않는다.
--   앱의 서비스 목록(44개)이 service_catalog 시드(7개)보다 훨씬 많아서
--   service_key 로 FK 를 걸면 나머지 37개가 전부 거부되기 때문이다.
--   service_catalog 는 FK 제약이 아니라 **참고용 조회 테이블**로 둔다.
-- ============================================================

-- 1) 기존 외래키 제거
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_service_id_fkey;
ALTER TABLE transactions  DROP CONSTRAINT IF EXISTS transactions_service_id_fkey;

-- 2) 타입 변경 (기존 숫자 값은 문자열로 보존)
ALTER TABLE subscriptions
  ALTER COLUMN service_id TYPE TEXT USING service_id::TEXT;

ALTER TABLE transactions
  ALTER COLUMN service_id TYPE TEXT USING service_id::TEXT;

-- 3) 이미 들어가 있던 숫자 id 를 service_key 문자열로 치환
UPDATE subscriptions s
   SET service_id = c.service_key
  FROM service_catalog c
 WHERE s.service_id = c.id::TEXT;

UPDATE transactions t
   SET service_id = c.service_key
  FROM service_catalog c
 WHERE t.service_id = c.id::TEXT;

-- 4) 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_subscriptions_service_id ON subscriptions(service_id);
CREATE INDEX IF NOT EXISTS idx_transactions_service_id  ON transactions(service_id);

-- ============================================================
-- 5) service_catalog 시드 키를 앱의 서비스 id 와 일치시킨다
--    (src/data/services.js 기준 — 안 맞으면 카탈로그 조회가 항상 빗나간다)
-- ============================================================
UPDATE service_catalog SET service_key = 'naverplus'      WHERE service_key = 'naver_membership';
UPDATE service_catalog SET service_key = 'coupangwow'     WHERE service_key = 'coupang_wow';
UPDATE service_catalog SET service_key = 'youtubepremium' WHERE service_key = 'youtube_premium';
UPDATE service_catalog SET service_key = 'baeminclub'     WHERE service_key = 'baemin';
-- chatgpt · claude · gemini 는 이미 일치
