# SubClean 🍎

Gmail 결제 메일을 분석해 내가 쓰고 있는 **구독 서비스를 자동으로 찾아내고**,
다음 결제일까지 남은 날짜를 사과 카드로 보여주는 구독 관리 앱입니다.

> 원칙: **메일에서 확인된 사실만 기록합니다.** 정가·평균값 같은 추정치는 넣지 않고 `null` 로 둡니다.
> 메일 원문은 저장하지 않고, 근거 문장과 메시지 ID만 남깁니다.

## 주요 기능

- **Gmail 자동 탐지** — 결제/영수증 메일을 검색해 구독·금액·결제일을 추출
- **결제 일정 (30일 내)** — 자동결제 임박 구독을 D-day 순으로 정렬
- **사과 바구니 UI** — 🍏 여유 / 🟡 주의 / 🍎 임박 / 🖤 오늘 결제
- **지출 분석** — 카테고리별·월별 구독 지출
- **해지 가이드** — 서비스별 해지 경로 템플릿
- **캘린더 내보내기** — 결제일을 `.ics` 로 저장
- **Chrome 확장 스켈레톤** — 서비스 페이지에서 구독 정보 수집 (`extension/`)

지원 서비스: 네이버 멤버십 · 쿠팡 와우 · YouTube Premium · ChatGPT · Claude · Gemini · 배달의민족

## 기술 스택

Vite · React · Supabase (Auth + Postgres + RLS) · Gmail API

Supabase 미설정 시 `localStorage` 로 동작합니다.

## 시작하기

```bash
npm install
cp .env.example .env   # 값 채우기
npm run dev
```

### 환경변수

| 키 | 설명 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_GOOGLE_CLIENT_ID` | Gmail 연동용 Google OAuth 클라이언트 ID |
| `VITE_APP_ENV` | `development` / `production` |

Supabase 스키마는 `supabase/migrations/` 의 SQL을 순서대로 실행하면 됩니다.

## 구조

| 경로 | 설명 |
|---|---|
| `src/lib/gmailApi.js` | Gmail API 클라이언트 (OAuth · 검색 · 메시지 fetch) |
| `src/lib/emailParsers/` | 서비스별 결제 메일 파서 |
| `src/services/emailDetectionService.js` | 메일 검색 → 분류 → 데이터 추출 |
| `src/lib/supabase.js` · `src/lib/auth.jsx` | Supabase Client · AuthProvider |
| `src/data/myGmail.js` | **샘플** 분석 결과 (개인 데이터 아님) |
| `supabase/migrations/` | 스키마 + RLS 정책 |
| `extension/` | Chrome 확장 |

## 개인정보

이 저장소에는 **실제 결제 정보를 커밋하지 않습니다.**
`.env`, `*.ics`, `_private/` 는 `.gitignore` 로 제외되어 있고,
`src/data/myGmail.js` 는 구조만 보여주는 예시 데이터입니다.
