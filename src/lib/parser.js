/**
 * SubClean 파싱 엔진 — 완전 로컬 정규식 기반 (외부 API 호출 없음)
 *
 * 이메일 / 문자(SMS·알림톡) 원문을 넣으면
 *   서비스명 · 금액 · 통화 · 결제주기 · 다음 결제일 · 무료체험 만료일 · 메시지 유형
 * 을 추출한다.
 */

import { ALIAS_INDEX } from '../data/services.js'

/* ────────────────────────────────────────────────────────────
 * 1. 블록 분리 — 여러 통의 메일/문자를 한 번에 붙여넣을 수 있게
 * ──────────────────────────────────────────────────────────── */

const BLOCK_SEPARATOR = /^\s*(?:-{3,}|={3,}|#{3,}|\*{3,})\s*$/gm

export function splitBlocks(raw) {
  if (!raw || !raw.trim()) return []
  const bySep = raw
    .split(BLOCK_SEPARATOR)
    .map((b) => b.trim())
    .filter(Boolean)
  if (bySep.length > 1) return bySep

  // 구분자가 없으면 빈 줄 2개 이상 + 다음 블록이 헤더처럼 보일 때만 분리
  const chunks = raw.split(/\n{3,}/).map((b) => b.trim()).filter(Boolean)
  if (chunks.length > 1 && chunks.every((c) => c.length > 20)) return chunks
  return [raw.trim()]
}

/* ────────────────────────────────────────────────────────────
 * 2. 날짜 추출
 * ──────────────────────────────────────────────────────────── */

const MONTH_EN = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}

function iso(y, m, d) {
  if (!y || !m || !d) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 연도가 생략된 날짜는 기준일에서 가장 가까운 미래(±6개월)로 보정 */
function inferYear(month, day, base) {
  const y = base.getFullYear()
  const candidates = [y - 1, y, y + 1]
    .map((yy) => ({ yy, v: iso(yy, month, day) }))
    .filter((c) => c.v)
  if (!candidates.length) return null
  const baseT = base.getTime()
  let best = null
  for (const c of candidates) {
    const diff = new Date(c.v + 'T00:00:00Z').getTime() - baseT
    // 과거 45일 ~ 미래 320일 범위를 가장 자연스러운 값으로 본다
    const score = diff >= -45 * 864e5 ? diff : Infinity
    if (best === null || score < best.score) best = { score, value: c.v }
  }
  return best?.value ?? candidates[1]?.v ?? null
}

/**
 * 텍스트 내 모든 날짜를 { index, value(ISO), raw } 로 반환
 */
export function extractDates(text, today = new Date()) {
  const out = []
  const push = (index, raw, value) => {
    if (value) out.push({ index, raw, value })
  }

  const patterns = [
    // 2026년 8월 3일 / 2026 년 8 월 3 일
    {
      re: /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
      map: (m) => iso(+m[1], +m[2], +m[3]),
    },
    // 2026-08-03 / 2026.08.03 / 2026/08/03
    {
      re: /(\d{4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/g,
      map: (m) => iso(+m[1], +m[2], +m[3]),
    },
    // August 3, 2026 / Aug 3 2026
    {
      re: /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g,
      map: (m) => {
        const mo = MONTH_EN[m[1].toLowerCase()]
        return mo ? iso(+m[3], mo, +m[2]) : null
      },
    },
    // 3 August 2026
    {
      re: /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g,
      map: (m) => {
        const mo = MONTH_EN[m[2].toLowerCase()]
        return mo ? iso(+m[3], mo, +m[1]) : null
      },
    },
    // 8월 3일 (연도 생략)
    {
      re: /(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
      map: (m) => inferYear(+m[1], +m[2], today),
    },
    // Aug 3 (연도 생략)
    {
      re: /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*,?\s*\d{4})/g,
      map: (m) => {
        const mo = MONTH_EN[m[1].toLowerCase()]
        return mo ? inferYear(mo, +m[2], today) : null
      },
    },
    // 08/03 · 08.03 (연도 생략, 월/일)
    {
      re: /(?<![\d./-])(\d{1,2})[./](\d{1,2})(?![\d./-])/g,
      map: (m) => inferYear(+m[1], +m[2], today),
    },
  ]

  const taken = []
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a)

  for (const p of patterns) {
    p.re.lastIndex = 0
    let m
    while ((m = p.re.exec(text)) !== null) {
      const s = m.index
      const e = m.index + m[0].length
      if (overlaps(s, e)) continue
      const v = p.map(m)
      if (v) {
        taken.push([s, e])
        push(s, m[0], v)
      }
    }
  }

  // 상대 날짜: "7일 후", "내일", "오늘", "in 7 days"
  const rel = [
    { re: /(\d{1,3})\s*일\s*(?:후|뒤|이내)/g, days: (m) => +m[1] },
    { re: /in\s+(\d{1,3})\s+days?/gi, days: (m) => +m[1] },
    { re: /내일/g, days: () => 1 },
    { re: /오늘/g, days: () => 0 },
    { re: /(\d{1,2})\s*개월\s*(?:후|뒤)/g, days: (m) => +m[1] * 30 },
  ]
  for (const r of rel) {
    r.re.lastIndex = 0
    let m
    while ((m = r.re.exec(text)) !== null) {
      const d = new Date(today.getTime() + r.days(m) * 864e5)
      push(m.index, m[0], iso(d.getFullYear(), d.getMonth() + 1, d.getDate()))
    }
  }

  return out.sort((a, b) => a.index - b.index)
}

/* ────────────────────────────────────────────────────────────
 * 3. 금액 추출
 * ──────────────────────────────────────────────────────────── */

const AMOUNT_PATTERNS = [
  { re: /₩\s?([\d,]+(?:\.\d+)?)/g, currency: 'KRW' },
  { re: /(?:KRW|krw)\s?([\d,]+(?:\.\d+)?)/g, currency: 'KRW' },
  { re: /([\d,]+)\s*원/g, currency: 'KRW' },
  { re: /\$\s?([\d,]+(?:\.\d{1,2})?)/g, currency: 'USD' },
  { re: /(?:USD|usd)\s?([\d,]+(?:\.\d{1,2})?)/g, currency: 'USD' },
  { re: /([\d,]+(?:\.\d{1,2})?)\s*(?:USD|usd|달러)/g, currency: 'USD' },
]

const AMOUNT_KEYWORDS = [
  '결제금액', '결제 금액', '청구금액', '청구 금액', '이용금액', '총액', '합계',
  '요금', '금액', 'total', 'amount', 'charged', 'price', 'payment',
]

export function extractAmount(text) {
  const found = []
  for (const p of AMOUNT_PATTERNS) {
    p.re.lastIndex = 0
    let m
    while ((m = p.re.exec(text)) !== null) {
      const value = parseFloat(m[1].replace(/,/g, ''))
      if (!Number.isFinite(value) || value <= 0) continue
      if (p.currency === 'KRW' && value < 100) continue // 100원 미만은 오탐일 확률이 큼
      if (p.currency === 'USD' && value > 5000) continue
      found.push({ index: m.index, value, currency: p.currency, raw: m[0].trim() })
    }
  }
  if (!found.length) return null

  const lower = text.toLowerCase()
  // 금액 키워드 바로 뒤(0~40자)에 등장하는 값을 우선
  let best = null
  for (const kw of AMOUNT_KEYWORDS) {
    let from = 0
    for (;;) {
      const ki = lower.indexOf(kw.toLowerCase(), from)
      if (ki === -1) break
      from = ki + kw.length
      for (const f of found) {
        const dist = f.index - ki
        if (dist >= 0 && dist <= 40) {
          if (!best || dist < best.dist) best = { ...f, dist }
        }
      }
    }
  }
  if (best) return { value: best.value, currency: best.currency, raw: best.raw }

  // 없으면 가장 큰 금액 (부가세 포함 총액일 확률)
  const top = found.reduce((a, b) => (b.value > a.value ? b : a))
  return { value: top.value, currency: top.currency, raw: top.raw }
}

/* ────────────────────────────────────────────────────────────
 * 4. 결제 주기 / 메시지 유형
 * ──────────────────────────────────────────────────────────── */

export function extractCycle(text) {
  const t = text.toLowerCase()
  if (/(연간|1년|매년|년 정기|annual|yearly|per year|\/yr|\/year)/.test(t)) return 'yearly'
  if (/(주간|매주|weekly|per week|\/wk)/.test(t)) return 'weekly'
  if (/(분기|quarterly)/.test(t)) return 'quarterly'
  if (/(월간|매월|1개월|한 달|월 정기|monthly|per month|\/mo|\/month)/.test(t)) return 'monthly'
  return 'monthly'
}

const TYPE_RULES = [
  {
    type: 'trial',
    label: '무료체험 만료 임박',
    re: /(무료\s*체험|무료\s*이용|체험\s*기간|체험이\s*종료|free\s*trial|trial\s*end|trial\s*period|첫\s*달\s*무료|1개월\s*무료)/i,
  },
  {
    type: 'upcoming',
    label: '자동결제 예정',
    re: /(결제\s*예정|갱신\s*예정|자동\s*갱신|자동\s*결제\s*안내|다음\s*결제|정기결제\s*안내|will\s*be\s*charged|renews?\s*on|upcoming\s*(?:payment|charge)|next\s*(?:billing|payment|charge))/i,
  },
  {
    type: 'paid',
    label: '결제 완료',
    re: /(결제\s*(?:완료|되었|성공|승인)|승인\s*금액|영수증|payment\s*(?:received|successful|confirm)|receipt|has\s*been\s*charged|thank\s*you\s*for\s*your\s*payment)/i,
  },
  {
    type: 'pricechange',
    label: '요금 인상 안내',
    re: /(요금\s*(?:인상|변경|조정)|가격\s*(?:인상|변경)|price\s*(?:increase|change)|updating\s*our\s*prices)/i,
  },
]

export function extractType(text) {
  for (const r of TYPE_RULES) {
    if (r.re.test(text)) return { type: r.type, label: r.label }
  }
  return { type: 'unknown', label: '분류 미상' }
}

/* ────────────────────────────────────────────────────────────
 * 5. 서비스 식별
 * ──────────────────────────────────────────────────────────── */

const SENDER_RE = /(?:from|보낸사람|발신)\s*[:：]?\s*([^\n<]*?)?<?([\w.+-]+@[\w.-]+)>?/i
const SMS_BRACKET_RE = /^\s*[[【]\s*(?:web발신|웹발신|국제발신|광고)?\s*[\]】]?\s*[[【]?([^\]】\n]{2,20})[\]】]/i

export function identifyService(text) {
  const lower = text.toLowerCase()
  for (const { alias, service } of ALIAS_INDEX) {
    if (lower.includes(alias)) {
      return { service, matchedBy: alias, confidence: 0.95 }
    }
  }

  // 사전에 없는 서비스 → 발신자 도메인/문자 말머리에서 이름 추정
  const sender = text.match(SENDER_RE)
  if (sender) {
    const display = (sender[1] || '').trim().replace(/["']/g, '')
    const domain = sender[2].split('@')[1] || ''
    const core = domain.split('.').filter((p) => !['co', 'com', 'kr', 'net', 'org', 'io', 'www', 'mail', 'email'].includes(p))[0]
    const guess = display && display.length <= 24 ? display : core
    if (guess) {
      return {
        service: null,
        guessedName: guess.charAt(0).toUpperCase() + guess.slice(1),
        matchedBy: `발신자(${domain})`,
        confidence: 0.5,
      }
    }
  }

  const bracket = text.match(SMS_BRACKET_RE)
  if (bracket && bracket[1]) {
    return { service: null, guessedName: bracket[1].trim(), matchedBy: '문자 말머리', confidence: 0.45 }
  }

  return { service: null, guessedName: '', matchedBy: null, confidence: 0.1 }
}

/* ────────────────────────────────────────────────────────────
 * 6. 날짜 역할 배정
 * ──────────────────────────────────────────────────────────── */

const DATE_ROLE_KEYWORDS = [
  { role: 'trialEnd', weight: 3, words: ['무료 체험 종료', '무료체험 종료', '체험 종료', '체험 기간 종료', '무료 이용 종료', '무료 기간', 'trial ends', 'trial will end', 'free trial', '체험이 종료되는', '무료체험이 끝나'] },
  { role: 'nextBilling', weight: 3, words: ['다음 결제일', '다음 결제 예정일', '다음 결제', '결제 예정일', '갱신일', '갱신 예정일', '자동 갱신일', '정기결제일', '차기 결제', 'next billing date', 'next payment', 'next charge', 'renews on', 'renewal date', 'will be charged on', 'will renew on'] },
  { role: 'lastPaid', weight: 2, words: ['결제일', '결제 완료일', '승인일시', '승인일', '거래일시', '이용일시', 'payment date', 'charged on', 'paid on', 'transaction date', 'billed on'] },
]

function assignDateRoles(text, dates) {
  const lower = text.toLowerCase()
  const result = { trialEnd: null, nextBilling: null, lastPaid: null }
  const scored = { trialEnd: Infinity, nextBilling: Infinity, lastPaid: Infinity }
  const used = new Set()

  for (const group of DATE_ROLE_KEYWORDS) {
    for (const w of group.words) {
      let from = 0
      for (;;) {
        const ki = lower.indexOf(w.toLowerCase(), from)
        if (ki === -1) break
        from = ki + w.length
        for (const d of dates) {
          const dist = d.index - ki
          // 키워드 뒤 60자 이내, 혹은 키워드 앞 25자 이내(“8월 3일에 결제 예정” 형태)
          const ok = (dist >= 0 && dist <= 60) || (dist < 0 && dist >= -25)
          if (!ok) continue
          const cost = Math.abs(dist) / group.weight
          if (cost < scored[group.role]) {
            scored[group.role] = cost
            result[group.role] = d.value
            used.add(d.value)
          }
        }
      }
    }
  }

  // 역할이 하나도 안 잡혔으면 미래 날짜 중 가장 가까운 것을 다음 결제일로
  if (!result.nextBilling && !result.trialEnd && dates.length) {
    const todayIso = new Date().toISOString().slice(0, 10)
    const future = dates.map((d) => d.value).filter((v) => v >= todayIso).sort()
    if (future.length) result.nextBilling = future[0]
    else result.lastPaid = dates.map((d) => d.value).sort().pop()
  }

  return result
}

/* ────────────────────────────────────────────────────────────
 * 7. 메인 파서
 * ──────────────────────────────────────────────────────────── */

export function parseBlock(raw, today = new Date()) {
  const text = raw.replace(/\r/g, '')
  const dates = extractDates(text, today)
  const roles = assignDateRoles(text, dates)
  const amount = extractAmount(text)
  const cycle = extractCycle(text)
  const typeInfo = extractType(text)
  const ident = identifyService(text)

  const svc = ident.service
  const name = svc?.name || ident.guessedName || '알 수 없는 서비스'

  // 무료체험 메일인데 만료일이 없고 다음 결제일만 있으면 그 날짜를 만료일로 본다
  let trialEnd = roles.trialEnd
  let nextBilling = roles.nextBilling
  if (typeInfo.type === 'trial' && !trialEnd && nextBilling) {
    trialEnd = nextBilling
  }
  if (!nextBilling && trialEnd) nextBilling = trialEnd

  // 신뢰도 산정
  let confidence = ident.confidence
  if (amount) confidence += 0.2
  if (nextBilling || trialEnd) confidence += 0.25
  if (typeInfo.type !== 'unknown') confidence += 0.1
  confidence = Math.min(0.99, confidence)

  const warnings = []
  if (!amount) warnings.push('금액을 찾지 못했습니다. 직접 입력해 주세요.')
  if (!nextBilling && !trialEnd) warnings.push('결제/만료 날짜를 찾지 못했습니다. 직접 입력해 주세요.')
  if (!svc) warnings.push('내장 서비스 사전에 없는 서비스입니다. 해지 가이드는 직접 메모해야 합니다.')

  return {
    raw: text,
    serviceId: svc?.id ?? null,
    name,
    category: svc?.category ?? 'etc',
    amount: amount?.value ?? svc?.defaultPrice ?? null,
    currency: amount?.currency ?? svc?.currency ?? 'KRW',
    cycle,
    nextBilling,
    trialEnd,
    lastPaid: roles.lastPaid,
    messageType: typeInfo.type,
    messageLabel: typeInfo.label,
    matchedBy: ident.matchedBy,
    confidence,
    warnings,
    detectedDates: dates.map((d) => ({ raw: d.raw, value: d.value })),
  }
}

export function parseText(raw, today = new Date()) {
  return splitBlocks(raw).map((b) => parseBlock(b, today))
}
