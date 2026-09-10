import { parseEmail } from '../lib/emailParsers/index.js'
import { SERVICES } from '../data/services.js'

/**
 * 서비스별 Gmail 감지 규칙 (카탈로그 services.js 의 id 기준)
 *   domains : 발신 도메인 — from:(...) 에 OR로 들어간다
 *   must    : 같은 도메인을 공유하는 서비스를 구분하기 위한 필수 키워드(선택)
 *
 * ⚠️ "실제 구독/결제인지"의 최종 판정은 Inbox 스캔에서 이벤트 신호(hasSignal)로 한 번 더 거른다.
 *    여기서는 "그 서비스의 결제성 메일을 찾아오는" 역할만 한다.
 */
const DETECTION = {
  // ── OTT·영상 ──
  tving:           { domains: 'tving.com' },
  wavve:           { domains: 'wavve.co.kr OR wavve.com' },
  coupangplay:     { domains: 'coupang.com', must: '쿠팡플레이 OR "coupang play"' },
  watcha:          { domains: 'watcha.com OR watcha.co.kr' },
  netflix:         { domains: 'netflix.com' },
  disneyplus:      { domains: 'disneyplus.com OR mail.disneyplus.com' },
  appletv:         { domains: 'apple.com OR email.apple.com', must: '"Apple TV" OR "TV+"' },
  youtubepremium:  { domains: 'youtube.com OR google.com OR payments.google.com', must: 'YouTube OR 유튜브' },
  // ── 음악·오디오 ──
  melon:           { domains: 'melon.com' },
  genie:           { domains: 'genie.co.kr' },
  flo:             { domains: 'music-flo.com OR musicflo.com' },
  spotify:         { domains: 'spotify.com' },
  bugs:            { domains: 'bugs.co.kr' },
  audible:         { domains: 'audible.com OR amazon.com', must: 'Audible' },
  // ── 쇼핑·멤버십 ──
  coupangwow:      { domains: 'coupang.com', must: '와우 OR WOW' },
  naverplus:       { domains: 'naver.com OR navercorp.com', must: '네이버플러스 OR 멤버십 OR "네이버 멤버십"' },
  ssg:             { domains: 'ssg.com' },
  amazonprime:     { domains: 'amazon.com OR amazon.co.kr', must: 'Prime OR 프라임' },
  // ── 생산성·협업 ──
  notion:          { domains: 'notion.so OR mail.notion.so' },
  slack:           { domains: 'slack.com' },
  microsoft365:    { domains: 'microsoft.com OR office.com', must: '"Microsoft 365" OR Office OR 오피스' },
  zoom:            { domains: 'zoom.us OR zoom.com' },
  linkedin:        { domains: 'linkedin.com', must: 'Premium' },
  // ── 클라우드·저장 ──
  googleone:       { domains: 'google.com OR payments.google.com', must: '"Google One" OR "구글 원"' },
  icloud:          { domains: 'apple.com OR email.apple.com', must: 'iCloud' },
  dropbox:         { domains: 'dropbox.com' },
  // ── AI·개발 ──
  chatgpt:         { domains: 'openai.com OR chatgpt.com' },
  claude:          { domains: 'anthropic.com OR claude.ai' },
  gemini:          { domains: 'google.com OR googlemail.com', must: 'Gemini' },
  github:          { domains: 'github.com', must: 'billing OR receipt OR Copilot OR Sponsors OR Pro' },
  midjourney:      { domains: 'midjourney.com' },
  // ── 디자인·크리에이티브 ──
  adobe:           { domains: 'adobe.com' },
  canva:           { domains: 'canva.com' },
  figma:           { domains: 'figma.com' },
  // ── 교육·학습 / 뉴스 ──
  millie:          { domains: 'millie.co.kr' },
  ridi:            { domains: 'ridibooks.com OR ridi.com' },
  classi101:       { domains: 'class101.net OR class101.com' },
  nytimes:         { domains: 'nytimes.com OR e.newyorktimes.com' },
  // ── 게임 ──
  xboxgamepass:    { domains: 'microsoft.com OR xbox.com', must: 'Xbox OR "Game Pass"' },
  playstationplus: { domains: 'playstation.com OR sony.com OR scei.co.jp', must: 'PlayStation OR "PS Plus" OR "PlayStation Plus"' },
  // ── 생활·모빌리티 ──
  baeminclub:      { domains: 'baemin.com', must: '배민클럽 OR 클럽 OR 구독' },
  coupangeats:     { domains: 'coupangeats.com OR coupang.com', must: '이츠 OR eats' },
  grammarly:       { domains: 'grammarly.com' },
}

// 결제·구독 관련 메일만 좁혀 받기 위한 공통 검색어(본문 전체 대상)
const BILLING_TERMS = '구독 OR 결제 OR 영수증 OR 청구 OR 갱신 OR 정기 OR 멤버십 OR receipt OR invoice OR payment OR subscription OR renew OR renewal OR billing OR trial OR membership'

const CATALOG = new Map(SERVICES.map((s) => [s.id, s]))

const EVENT_KEYWORDS = {
  trial_started: ['무료 체험', 'free trial', 'trial started', 'trial has started', '시작'],
  trial_ending: ['곧 만료', '만료 예정', 'trial ending', 'trial expires', 'will end'],
  trial_ended: ['만료되었', 'trial ended', 'trial has ended', '체험 종료'],
  payment_scheduled: ['결제 예정', 'scheduled', 'will be charged', 'next payment', 'preparing'],
  payment_completed: ['결제 완료', 'payment completed', 'receipt', '영수증', '청구', 'charged', 'paid'],
  payment_failed: ['결제 실패', 'payment failed', 'declined', '결제 오류'],
  subscription_renewed: ['갱신', 'renewed', 'renewal', '자동 결제'],
  subscription_cancelled: ['해지', 'cancelled', 'cancellation', '취소', 'unsubscribed'],
}

/** 감지 규칙 + 카탈로그 둘 다에 존재하는 서비스 id 목록 */
export function getServiceIds() {
  return Object.keys(DETECTION).filter((id) => CATALOG.has(id))
}

export function getGmailQuery(serviceKey) {
  const d = DETECTION[serviceKey]
  if (!d) return ''
  let q = `from:(${d.domains}) newer_than:1y`
  if (d.must) q += ` (${d.must})`
  q += ` (${BILLING_TERMS})`
  return q
}

export function getServiceMeta(serviceKey) {
  const s = CATALOG.get(serviceKey)
  if (!s) return null
  return { serviceId: s.id, name: s.name, category: s.category, currency: s.currency || 'KRW' }
}

export function getAllServices() {
  return getServiceIds().map((id) => {
    const s = CATALOG.get(id)
    return {
      key: id,
      serviceId: id,
      name: s.name,
      category: s.category,
      currency: s.currency || 'KRW',
      query: getGmailQuery(id),
    }
  })
}

export function detectEventType(subject, body) {
  const text = `${subject} ${body}`.toLowerCase()
  for (const [eventType, keywords] of Object.entries(EVENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) return eventType
    }
  }
  const parsed = parseEmail(subject, body)
  return parsed?.eventType || 'unknown'
}

export function classifyMessage(subject, body, sender) {
  const text = `${subject} ${body}`.toLowerCase()

  if (/naver|nmail|네이버/.test(text) && /멤버십|네이버플러스/.test(text)) return 'naverplus'
  if (/coupang|쿠팡/.test(text) && /와우|멤버십|wow/.test(text)) return 'coupangwow'
  if (/youtube|유튜브/.test(text) && /premium|membership/.test(text)) return 'youtubepremium'
  if (/chatgpt|openai/.test(text) && /subscription|plus|billing/.test(text)) return 'chatgpt'
  if (/claude|anthropic/.test(text) && /subscription|pro|billing/.test(text)) return 'claude'
  if (/gemini|google one/.test(text) && /subscription|advanced|ai/.test(text)) return 'gemini'
  if (/baemin|배민|배달/.test(text) && /클럽|구독/.test(text)) return 'baeminclub'

  if (sender) {
    const s = sender.toLowerCase()
    if (s.includes('nmail') || s.includes('naver')) return 'naverplus'
    if (s.includes('coupang')) return 'coupangwow'
    if (s.includes('youtube') || s.includes('google')) return 'youtubepremium'
    if (s.includes('openai') || s.includes('chatgpt')) return 'chatgpt'
    if (s.includes('anthropic') || s.includes('claude')) return 'claude'
    if (s.includes('baemin')) return 'baeminclub'
  }

  return null
}

export function extractAmount(text) {
  // 영수증에는 소계·부가세·합계가 함께 있어, 첫 숫자가 아니라 "가장 큰 금액(=합계)"을 청구액으로 본다
  const patterns = [
    /(\d[\d,]*\.?\d*)\s*원/g,
    /\$\s*(\d+\.?\d*)/g,
    /(?:USD|KRW)\s*(\d+\.?\d*)/gi,
    /(\d+\.?\d*)\s*(?:USD|KRW)/gi,
  ]
  const amounts = []
  for (const p of patterns) {
    let m
    while ((m = p.exec(text)) !== null) {
      const v = parseFloat(m[1].replace(/,/g, ''))
      if (!Number.isNaN(v) && v > 0) amounts.push(v)
    }
  }
  return amounts.length ? Math.max(...amounts) : null
}

export function extractCurrency(text) {
  if (/\$|USD/.test(text)) return 'USD'
  if (/원|KRW/.test(text)) return 'KRW'
  return null
}

export function extractDate(text) {
  // 결제예정/갱신 메일에서는 여러 날짜 중 "가장 미래의 날짜"가 다음 결제일일 가능성이 높다
  const found = []
  const add = (y, mo, d) => {
    const mm = parseInt(mo, 10), dd = parseInt(d, 10)
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      found.push(`${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`)
    }
  }
  let m
  const p1 = /(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/g
  while ((m = p1.exec(text)) !== null) add(m[1], m[2], m[3])
  const p2 = /(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})/g
  while ((m = p2.exec(text)) !== null) add(m[3], m[1], m[2])
  const p3 = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g
  while ((m = p3.exec(text)) !== null) add(m[1], m[2], m[3])

  if (!found.length) return null
  found.sort()
  return found[found.length - 1]
}

export function formatMessagePreview(msg) {
  const subject = msg.subject || '(제목 없음)'
  const date = msg.date || ''
  const snippet = (msg.snippet || '').slice(0, 120)
  return { subject, date, snippet }
}
