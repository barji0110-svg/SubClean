# SubClean — 작업 재개 가이드

## 🚀 배포됨 (2026-09-11)

**https://sub-clean.vercel.app** — Google 로그인까지 동작 확인 완료.

| 서비스 | 상태 |
|---|---|
| GitHub | `barji0110-svg/SubClean` (public) |
| Vercel | `sub-clean.vercel.app` · Hobby 플랜 · 팀 `ming` |
| Supabase | 프로젝트 `subclean` · Free · Northeast Asia (Tokyo) · Healthy |
| Google Cloud | 프로젝트 `My First Project` · OAuth 클라이언트 활성 |

**배포 번들 실측 검증 (2026-09-11)**
- `createClient` · `GoTrue` · `signInWithOAuth` 포함 → 환경변수가 빌드에 반영됨
- `access_type=offline` 포함 → refresh token 수정 배포됨
- SPA rewrite 동작 (`/gmail-callback`, `/anything/deep` 모두 200 + index.html)
- 개인정보(이메일·카드번호·영수증번호) **0건**

**⚠️ `vercel.json` 에 주석을 넣지 말 것 (2026-09-13 실측)**

설명용으로 `"comment"` 키를 넣었더니 Vercel 설정 스키마 검증에서 **배포가 실패**했다.
그런데 이전 배포가 계속 서빙되므로 **사이트는 멀쩡해 보인다.** `/sw.js` 가
`text/html` 로 응답(= SPA 리라이트 폴백)하는 걸 보고서야 알아챘다.
배포가 반영 안 된 것 같으면 **Vercel Deployments 에서 Error 여부부터** 확인할 것.

**⚠️ 배포 확인용 폴링 주의**

curl 로 40회 폴링했더니 Vercel 봇 보호(Security Checkpoint)가 발동해 403 이 났다.
배포 확인은 대시보드에서 보거나 요청 간격을 넉넉히 둘 것.

**Supabase URL Configuration (설정 완료)**
- Site URL: `https://sub-clean.vercel.app`
- Redirect URLs: `https://sub-clean.vercel.app/**` · `http://localhost:5173/**`
- ngrok 주소 제거함 (이게 남아 있어서 로그인 후 로컬 개발서버로 튕기던 문제 해결)

### 완료 (2026-09-13)

- [x] **구독 CRUD 클라우드 저장** — `lib/subsSync.js` write-behind 동기화.
      추가·수정·삭제·스누즈·체크리스트가 모두 Supabase 에 반영된다.
      (마이그레이션 `004` + `005` 필요)
- [x] **PWA 1단계** — 홈 화면 설치 + 오프라인.
      `manifest.webmanifest` · `sw.js` · 아이콘 4종 · `InstallPrompt.jsx`

### 남은 일

- [ ] **PWA 2단계: 서버 푸시** ← 제품 가치로는 이게 가장 크다.
      지금 알림은 `Notification` API 직접 호출이라 **앱이 열려 있을 때만** 뜬다
      (`Dashboard.jsx`, `gmailImport.js`). "결제 3일 전에 알려준다"는 핵심 가치가
      성립하려면 Supabase Edge Function + `pg_cron` 일일 실행 + Web Push 가 필요하다.
      **PWA냐 네이티브냐와 무관하게 필요한 작업이다.**
- [ ] **Gmail 연동** — 아래 "3. Gmail 연동은 아직 미완성" 참고 (선택, 앱은 없어도 동작)
- [ ] 네이버 메일 연동 — 아래 "알려진 한계" 참고

### 알려진 한계

**`supabase.js` 에 죽은 코드가 많다.** `fetchSubscriptions` · `saveSubscription` ·
`deleteSubscription` · `fetchServiceCatalog` · `saveSubscriptionEvent` 는 `db.js` 와
중복이고 호출부가 없다. 살아 있는 건 `saveServiceConnection` 하나뿐.
구독 저장의 단일 출처는 **`lib/subsSync.js`** 다.

**네이버 메일은 연동할 API 가 없다.** 네이버는 Gmail API 같은 제3자 메일 읽기 API 를
제공하지 않는다. 선택지:
- **자동전달** (권장 첫 시도): 네이버 메일 환경설정 → 자동전달 → Gmail 로 보내면
  기존 Gmail 연동이 그대로 잡는다. 단 탐지가 `from:` 발신 도메인 기준
  (`emailDetectionService.js`)이라, 전달 시 `From:` 헤더가 바뀌면 파서 보강이 필요하다.
- **확장 프로그램**: `extension/` 에 이미 `naverAdapter.js` 가 있다.
  `mail.naver.com` 어댑터를 추가하는 게 구조상 가장 자연스럽다 (비밀번호 불필요).
- **IMAP**: 기술적으로 가능하나 **네이버 계정 비밀번호를 저장해야 한다.**
  로그인 화면이 "외부 서비스 비밀번호를 저장하지 않습니다"라고 약속하고 있다. 권하지 않는다.

**스토어 배포의 벽은 개발이 아니라 Gmail 심사다.** Capacitor 로 감싸는 건 쉽지만,
스토어 공개 배포하려면 OAuth 를 프로덕션 게시해야 하고 `gmail.readonly` 는
restricted scope 라 **CASA 보안 심사(매년 갱신)** 대상이 된다.

---

## 이전 상태 (Phase 4: Apple Farm UI 리디자인 완료)

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

**OAuth 클라이언트 운영 메모 (Google Cloud → API 및 서비스 → 사용자 인증 정보)**

- **승인된 JavaScript 원본은 비워 둔다.** Supabase 가 서버 측에서 중개하므로
  브라우저가 Google 에 직접 요청하지 않는다. **Vercel 도메인을 여기 추가하지 말 것.**
- **승인된 리디렉션 URI 는 Supabase 콜백 하나뿐이다.** 배포 도메인이 바뀌어도
  이 값은 그대로다. 바뀌는 건 Supabase 쪽 URL Configuration 이지 Google 쪽이 아니다.
- **Client Secret 은 생성 후 다시 볼 수 없다.** Supabase 에 재입력해야 하면
  `+ Add secret` 으로 새로 발급받아야 한다.
- ⚠️ **6개월간 미사용이면 OAuth 클라이언트가 자동 삭제된다.**
  삭제되면 Google 로그인이 통째로 죽는다 (삭제 후 30일 내 복원 가능).

**2. `VITE_GOOGLE_CLIENT_ID` 는 불필요**

코드 어디서도 이 변수를 읽지 않는다. OAuth 는 Supabase 가 서버 측에서 중개하므로
클라이언트는 Client ID 를 알 필요가 없다. `.env.example` 에만 남아 있는 잔재다.

**3. Gmail 연동은 아직 미완성 (2026-09-11 실측)**

Google 인증 플랫폼(`console.cloud.google.com/auth/...`) 확인 결과:

| 항목 | 상태 |
|---|---|
| 게시 상태 (`/auth/audience`) | **테스트 중** · 사용자 유형 외부 |
| 테스트 사용자 | **0명** (한도 100명) |
| 등록된 범위 (`/auth/scopes`) | **0개** — 민감/제한 범위 전부 비어 있음 |

앱 로그인이 되는 이유: `email`/`profile` 은 기본 범위라 등록이 필요 없고,
**Google Cloud 프로젝트의 소유자·편집자 계정은 테스트 사용자로 등록하지 않아도 통과**하기 때문이다.
즉 지금은 "프로젝트 권한이 있는 사람만 쓸 수 있는 앱" 상태다.

**Gmail 연동을 켜려면 3가지가 모두 필요하다:**

- [ ] `/auth/scopes` → `범위 추가 또는 삭제` → `https://www.googleapis.com/auth/gmail.readonly` 추가
- [ ] Gmail API 활성화 — `console.cloud.google.com/apis/library/gmail.googleapis.com`
      (안 켜면 API 호출이 전부 403)
- [ ] `/auth/audience` → `+ Add users` 로 사용할 계정 등록 (최대 100명)

> **앱 게시(프로덕션 전환)는 하지 말 것.** `gmail.readonly` 는 restricted scope 라
> 게시하면 Google 보안 심사(CASA) 대상이 된다. 개인 프로젝트는
> **테스트 모드 유지 + 테스트 사용자 등록**이 맞는 길이다.

> Gmail 없이도 앱은 정상 동작한다 (로그인 · 수동 구독 등록 · D-day · 지출 분석 · 해지 가이드).
> Gmail 이 필요한 건 받은편지함 자동 분석 화면 하나뿐이다.

**4. 로그인 테스트**
- [ ] `npm run dev` 실행
- [ ] Gmail 로그인 버튼 테스트
- [ ] Gmail 연결 → 이메일 분석 흐름 테스트

**5. Vercel 배포**

> 🚨 **환경변수를 넣기 전에 배포하면 로그인이 통째로 사라진다.**
> `supabase.js` 의 `if (supabaseUrl && ...)` 가 빌드 시점에 `if (undefined && ...)` 로
> 치환되면서 Rollup 이 **Supabase SDK 전체를 죽은 코드로 제거**한다.
> 실측: `.env` 있음 912 KB / 없음 664 KB, `createClient`·`GoTrue`·`signInWithOAuth` 전부 소거.
>
> 게다가 **에러가 나지 않는다.** `App.jsx` 의 `configured === false` 경로가
> 인증·온보딩 게이트를 건너뛰고 localStorage 모드로 조용히 동작한다.
> 화면은 멀쩡한데 로그인 버튼만 없는 상태가 된다.
>
> **판별법: 배포된 사이트에 "Google로 시작하기" 버튼이 보이는가.**
> 안 보이면 환경변수가 빌드에 안 들어간 것 → 변수 확인 후 **Redeploy**.

- [ ] **배포를 누르기 전에** Environment Variables 에 `VITE_*` 3개 입력
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
