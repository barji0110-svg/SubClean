/** 날짜 · 주기 · 통화 유틸 (완전 로컬) */

export const CYCLE_LABEL = {
  weekly: '주간',
  monthly: '월간',
  quarterly: '분기',
  yearly: '연간',
}

export const CYCLE_MONTHS = {
  weekly: 7 / 30.4,
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

export function todayIso(d = new Date()) {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return t.toISOString().slice(0, 10)
}

export function parseIso(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** 오늘 기준 D-day. 음수면 이미 지남 */
export function dday(isoDate, base = new Date()) {
  const target = parseIso(isoDate)
  if (!target) return null
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  return Math.round((target - b) / 864e5)
}

export function formatDday(n) {
  if (n === null || n === undefined) return '—'
  if (n === 0) return 'D-DAY'
  if (n > 0) return `D-${n}`
  return `D+${Math.abs(n)}`
}

export function formatKDate(isoDate) {
  const d = parseIso(isoDate)
  if (!d) return '—'
  const week = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${week})`
}

export function formatShortDate(isoDate) {
  const d = parseIso(isoDate)
  if (!d) return '—'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 주기만큼 날짜를 더한다 */
export function addCycle(isoDate, cycle, times = 1) {
  const d = parseIso(isoDate)
  if (!d) return null
  if (cycle === 'weekly') d.setDate(d.getDate() + 7 * times)
  else if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3 * times)
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + times)
  else d.setMonth(d.getMonth() + times)
  return todayIso(d)
}

/** 지난 결제일을 오늘 이후로 굴려서 실제 다음 결제일을 얻는다 */
export function rollForward(isoDate, cycle, base = new Date()) {
  if (!isoDate) return null
  let cur = isoDate
  let guard = 0
  while (dday(cur, base) < 0 && guard < 500) {
    cur = addCycle(cur, cycle, 1)
    guard += 1
  }
  return cur
}

/* ── 통화 ── */

export function toKRW(amount, currency, usdRate) {
  if (amount == null) return 0
  return currency === 'USD' ? amount * usdRate : amount
}

/** 주기와 무관하게 "월 환산" 금액(원) */
export function monthlyKRW(sub, usdRate) {
  const krw = toKRW(sub.amount, sub.currency, usdRate)
  return krw / (CYCLE_MONTHS[sub.cycle] ?? 1)
}

/** 주기와 무관하게 "연 환산" 금액(원) */
export function yearlyKRW(sub, usdRate) {
  return monthlyKRW(sub, usdRate) * 12
}

export function formatKRW(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return '₩' + Math.round(n).toLocaleString('ko-KR')
}

export function formatMoney(amount, currency) {
  if (amount == null) return '—'
  if (currency === 'USD') return '$' + amount.toFixed(2)
  return '₩' + Math.round(amount).toLocaleString('ko-KR')
}

/** 최근 N개월 라벨 배열 (YYYY-MM) */
export function monthKeys(count, endDate = new Date(), forward = false) {
  const keys = []
  const d = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
  for (let i = 0; i < count; i += 1) {
    const k = new Date(d.getFullYear(), d.getMonth() + (forward ? i : -(count - 1 - i)), 1)
    keys.push(`${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

export function monthLabel(key) {
  const [y, m] = key.split('-')
  return `${Number(m)}월`
}

export function monthLabelFull(key) {
  const [y, m] = key.split('-')
  return `${y}. ${Number(m)}월`
}
