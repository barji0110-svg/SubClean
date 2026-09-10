# SubClean — 작업 재개 가이드

## 현재 상태 (Phase 4: Apple Farm UI 리디자인 완료)

### 완료된 작업
- [x] 기존 앱 구조 분석 및 유지
- [x] Supabase Client, Auth, DB 모듈 생성
- [x] SQL Migration (001_schema + 002_rls) Supabase에 적용 완료
- [x] .env 설정 완료 (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
- [x] .gitignore에 .env 보호 설정
- [x] localStorage fallback 유지 (configured=false 시 기존 앱)
- [x] Gmail API 클라이언트 (`src/lib/gmailApi.js`)
- [x] 서비스별 이메일 탐지 엔진 (`src/services/emailDetectionService.js`)
- [x] Inbox.jsx 실제 Gmail API 연동으로 전환
- [x] App.jsx Gmail OAuth 콜백 처리
- [x] Build 검증 완료 (719 modules)
- [x] **Apple Farm UI 리디자인**
  - [x] 대시보드 3열 (내비 / 사과바구니+구독 / 지출분석+결제일정)
  - [x] Gmail 연결 상태 배너 (마지막 분석일 표시)
  - [x] "📅 결제 일정 (30일 내)" 카드 추가
  - [x] 내 구독 목록 → 사과 카드 그리드 (🍎+D-day+서비스명+금액)
  - [x] 모바일 반응형 (3열→1열)
  - [x] Build 성공 (사과 테마 적용 완료)

### 남은 작업 (재개 시)

**0. Supabase 스키마 상태 확인 — 먼저 할 것**

프로젝트(`subclean`, Free, Northeast Asia Tokyo)는 **Healthy 상태로 살아 있다.**
`.env` 의 URL·키를 그대로 쓰면 된다. 다만 대시보드가 `LAST MIGRATION: No migrations` 로
표시되고 API Success Rate 가 76% 라, 스키마가 실제로 어떤 상태인지 확인이 필요하다.
(SQL Editor 로 직접 실행한 SQL 은 마이그레이션 이력에 남지 않으므로 "No migrations" 자체는 정상일 수 있다.)

**적용 현황 (실측 확인)**

**스키마 3종 전부 적용 완료 — 실측 확인함**

- [x] `001_schema.sql` — 테이블 + 카탈로그 시드 7행 확인
- [x] `002_rls.sql` — 6개 테이블 `relrowsecurity = true` 확인
      (delivery_orders · service_catalog · service_connections ·
       subscription_events · subscriptions · transactions)
- [x] `003_fix_service_id_type.sql` — `subscriptions.service_id` ·
      `transactions.service_id` 둘 다 `text` 확인

DB 쪽은 더 손댈 게 없다. 다음 세션에서 재확인하려면:

```sql
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;

select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public' and column_name = 'service_id';
```

> ⚠️ RLS 가 꺼진 테이블은 publishable key 만 있으면 누구나 전체 데이터를 읽는다.
> 그 키는 배포 번들에 그대로 박히므로(Vite `VITE_*` 는 빌드타임 치환) 사실상 공개 상태가 된다.
> **RLS 가 이 앱의 유일한 데이터 보호 장치다. 절대 끄지 말 것.**

> 참고: 로컬 실행 환경에서 `*.supabase.co` DNS 가 막혀 있을 수 있다.
> 그건 네트워크 제한이지 프로젝트가 죽은 게 아니다 — 대시보드에서 Status 를 확인할 것.

**1. Google OAuth — 이미 동작 중 (실측 확인)**

Authentication → Users 에 Google 로 로그인한 계정이 실제로 존재한다
(Providers 컬럼에 `Email, Google`). 즉 아래가 전부 이미 끝나 있다:

- [x] Google Cloud OAuth 동의 화면 설정
- [x] OAuth 클라이언트 ID 생성 (웹 애플리케이션)
- [x] 승인된 리디렉션 URI 등록 (`https://<project-ref>.supabase.co/auth/v1/callback`)
- [x] Supabase → Authentication → Providers → Google 활성화 + Client ID/Secret 입력

> Client Secret 은 **Supabase 대시보드에만** 넣는다.
> `.env` 에 `VITE_` 로 넣으면 빌드 번들에 박혀 공개된다.

**2. `VITE_GOOGLE_CLIENT_ID` 는 불필요**

코드 어디서도 이 변수를 읽지 않는다. OAuth 는 Supabase 가 서버 측에서 중개하므로
클라이언트는 Client ID 를 알 필요가 없다. `.env.example` 에만 남아 있는 잔재다.

**4. 로그인 테스트**
- [ ] `npm run dev` 실행
- [ ] Gmail 로그인 버튼 테스트
- [ ] Gmail 연결 → 이메일 분석 흐름 테스트

**5. Vercel 배포**
- [ ] Vercel → Settings → Environment Variables 에 `VITE_*` 3개 입력
      (Vite 는 **빌드타임**에 값을 박으므로 변수 추가 후 **재배포** 필수)
- [ ] Supabase → Authentication → URL Configuration
      - Site URL: `https://<앱>.vercel.app`
      - Redirect URLs: `https://<앱>.vercel.app/**` (+ 프리뷰용 `https://<프로젝트>-*.vercel.app/**`)
- [ ] Google Cloud 승인된 리디렉션 URI 를 **새 project ref** 로 교체

> Google Cloud "승인된 JavaScript 원본"에 Vercel 도메인을 넣을 필요는 **없다.**
> 브라우저가 Google 로 갈 때 redirect_uri 는 Supabase 콜백이라, Google 이 아는 도메인은 Supabase 하나뿐이다.

> `gmail.readonly` 는 restricted scope 다. Production 게시하려면 CASA 심사가 필요하므로,
> **OAuth 동의화면을 Testing 모드로 두고 테스트 사용자(최대 100명)를 등록**하는 게 현실적이다.
> 앱 로그인(`email`/`profile`)은 non-sensitive scope 라 심사 없이 누구나 가능하다.

### 실행 방법
```
cd D:\작업 2\subclean
npm run dev
```

### 환경변수 (.env)
- VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co (로컬 .env 에만 보관)
- VITE_SUPABASE_ANON_KEY=설정됨 (로컬 .env 에만 보관)
- VITE_APP_ENV=development

### 주요 파일

| 파일 | 설명 |
|------|------|
| `src/lib/gmailApi.js` | Gmail API 클라이언트 (OAuth, 검색, 메시지 fetch) |
| `src/services/emailDetectionService.js` | 7개 서비스 검색/분류/데이터 추출 |
| `src/lib/supabase.js` | Supabase Client + gmailSignIn |
| `src/lib/auth.jsx` | AuthProvider + useAuth |
| `src/components/Inbox.jsx` | Gmail 연결 + 분석 UI |
| `src/App.jsx` | Auth/Onboarding Gate + Gmail 콜백 |
| `supabase/migrations/` | SQL 스키마 + RLS |

### 7대 대상 서비스
네이버 멤버십 · 쿠팡 와우 · YouTube Premium · ChatGPT · Claude · Gemini · 배달의민족
