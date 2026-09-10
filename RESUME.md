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

**1. Google Cloud OAuth 설정 (완료한 단계)**
- [x] Google Cloud Console → API 및 서비스 → OAuth 동의 화면 → 3단계 연락처 정보 입력 완료
- [ ] OAuth 클라이언트 ID 생성 (웹 애플리케이션 유형)
- [ ] 승인된 리디렉션 URI 등록: `https://<your-project-ref>.supabase.co/auth/v1/callback`
- [ ] 클라이언트 ID + Secret 복사

**2. Supabase Dashboard Google Provider 설정**
- [ ] Supabase Dashboard → Authentication → Providers → Google
- [ ] Client ID + Client Secret 입력
- [ ] Scopes에 `https://www.googleapis.com/auth/gmail.readonly` 추가
- [ ] 저장

**3. .env 설정**
- [ ] `VITE_GOOGLE_CLIENT_ID=...` (Google Cloud 클라이언트 ID) 추가

**4. 로그인 테스트**
- [ ] `npm run dev` 실행
- [ ] Gmail 로그인 버튼 테스트
- [ ] Gmail 연결 → 이메일 분석 흐름 테스트

### 실행 방법
```
cd D:\작업 2\subclean
npm run dev
```

### 환경변수 (.env)
- VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co (로컬 .env 에만 보관)
- VITE_SUPABASE_ANON_KEY=설정됨 (로컬 .env 에만 보관)
- VITE_GOOGLE_CLIENT_ID=미설정 (재개 시 추가)
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
