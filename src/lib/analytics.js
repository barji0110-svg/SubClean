/** 파생 데이터 계산 (대시보드 우선순위 · 차트 시리즈) */

import { STATUS } from './storage.js'
import { CATEGORIES } from '../data/services.js'
import {
  dday, monthlyKRW, yearlyKRW, monthKeys, todayIso, rollForward,
} from './dates.js'

/**
 * 사과 위험 등급 (Apple Risk Level System)
 *  🍏 green  : 안전 · 정상 구독 · 해지 완료
 *  🟡 yellow : 주의 · D-7 ~ D-3 결제 예정
 *  🍎 red    : 경고 · D-2 ~ D-1 결제 임박
 *  🖤 poison : 위험 · 오늘 결제 직전 · 즉시 해지 필요
 */
export const RISK_ORDER = ['poison', 'red', 'yellow', 'green']

export const URGENCY = {
  poison: { label: '즉시 해지', emoji: '🖤', color: '#3A2F45' },
  red: { label: '결제 임박', emoji: '🍎', color: '#FF3B30' },
  yellow: { label: '주의', emoji: '🟡', color: '#FFC531' },
  green: { label: '안전', emoji: '🍏', color: '#5CBF60' },
  none: { label: '해당없음', emoji: '🍃', color: '#B8A392' },
}

/** 자동결제까지 남은 일수 기준 사과 등급 */
export function urgencyOf(sub, settings) {
  const base = { level: 'none', dday: null, target: null, critical: false, emoji: '🍃' }
  if (sub.status === STATUS.CANCELLED) return base
  const target = sub.trialEnd && sub.status !== STATUS.CANCELLED
    ? (dday(sub.trialEnd) >= 0 ? sub.trialEnd : sub.nextBilling)
    : sub.nextBilling
  const d = dday(target)
  if (d === null) return base

  let level = 'green'
  if (d <= 0) level = 'poison'
  else if (d <= 2) level = 'red'
  else if (d <= settings.alertDays) level = 'yellow'

  return {
    level,
    dday: d,
    target,
    critical: d <= settings.alertDays,
    emoji: URGENCY[level].emoji,
  }
}

export function isSnoozed(sub) {
  if (!sub.snoozeUntil) return false
  return dday(sub.snoozeUntil) > 0
}

/**
 * 오늘 처리해야 할 일 우선순위 큐.
 * 무료체험 만료 > D-day 임박 > 금액 큰 순 > 미사용 기간 긴 순
 */
export function actionQueue(subs, settings) {
  const items = subs
    .filter((s) => s.status !== STATUS.CANCELLED)
    .map((s) => {
      const u = urgencyOf(s, settings)
      const snoozed = isSnoozed(s)
      const unusedDays = s.lastUsed ? -dday(s.lastUsed) : null
      let score = 0
      if (u.dday !== null) score += Math.max(0, 400 - u.dday * 8)
      if (s.trialEnd && dday(s.trialEnd) !== null && dday(s.trialEnd) >= 0) score += 300
      if (s.status === STATUS.CANCELLING) score += 120
      score += Math.min(150, monthlyKRW(s, settings.usdRate) / 200)
      if (unusedDays !== null && unusedDays > 30) score += Math.min(100, unusedDays / 2)
      if (snoozed) score -= 500
      return { sub: s, urgency: u, snoozed, unusedDays, score }
    })
    .sort((a, b) => b.score - a.score)
  return items
}

/** 상태별 합계 */
export function summary(subs, settings) {
  const active = subs.filter((s) => s.status !== STATUS.CANCELLED)
  const cancelled = subs.filter((s) => s.status === STATUS.CANCELLED)
  const monthly = active.reduce((a, s) => a + monthlyKRW(s, settings.usdRate), 0)
  const yearly = active.reduce((a, s) => a + yearlyKRW(s, settings.usdRate), 0)
  const savedMonthly = cancelled.reduce((a, s) => a + monthlyKRW(s, settings.usdRate), 0)
  const savedYearly = savedMonthly * 12

  // 해지 시점부터 오늘까지 실제로 아낀 누적액
  const savedSoFar = cancelled.reduce((a, s) => {
    if (!s.cancelledAt) return a
    const months = Math.max(0, -dday(s.cancelledAt)) / 30.44
    return a + monthlyKRW(s, settings.usdRate) * months
  }, 0)

  const q = actionQueue(subs, settings)
  return {
    activeCount: active.length,
    cancelledCount: cancelled.length,
    monthly,
    yearly,
    savedMonthly,
    savedYearly,
    savedSoFar,
    criticalCount: q.filter((i) => i.urgency.critical && !i.snoozed).length,
    trialCount: active.filter((s) => s.trialEnd && dday(s.trialEnd) !== null && dday(s.trialEnd) >= 0).length,
    cancellingCount: subs.filter((s) => s.status === STATUS.CANCELLING).length,
  }
}

function monthStart(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1)
}
function monthEnd(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0)
}

/**
 * 월별 지출 추이 + 누적 절감액
 * spend  : 그 달에 실제로 나갔을 구독료(월 환산 합)
 * saved  : 그 시점까지 해지로 아낀 월 환산 누적액
 * total  : 해지하지 않았다면 냈을 금액 (spend + saved)
 */
export function monthlySeries(subs, settings, months = 12) {
  const keys = monthKeys(months)
  return keys.map((key) => {
    const start = monthStart(key)
    const end = monthEnd(key)
    let spend = 0
    let saved = 0
    for (const s of subs) {
      const m = monthlyKRW(s, settings.usdRate)
      const created = s.createdAt ? new Date(s.createdAt) : new Date(0)
      // 시드/등록 이전 달도 "그 시점에 이미 쓰고 있었다"고 보고 추이를 그린다
      const startedBefore = created <= end || s.source === 'seed'
      if (!startedBefore) continue
      if (s.status === STATUS.CANCELLED && s.cancelledAt) {
        const c = new Date(s.cancelledAt)
        if (c <= start) saved += m
        else spend += m
      } else {
        spend += m
      }
    }
    return {
      key,
      month: `${Number(key.split('-')[1])}월`,
      spend: Math.round(spend),
      saved: Math.round(saved),
      total: Math.round(spend + saved),
    }
  })
}

/** 카테고리별 월 환산 지출 */
export function categorySeries(subs, settings) {
  const map = new Map()
  for (const s of subs) {
    if (s.status === STATUS.CANCELLED) continue
    const c = s.category || 'etc'
    map.set(c, (map.get(c) || 0) + monthlyKRW(s, settings.usdRate))
  }
  return [...map.entries()]
    .map(([id, value]) => ({
      id,
      name: CATEGORIES[id]?.label ?? '기타',
      color: CATEGORIES[id]?.color ?? '#94a3b8',
      value: Math.round(value),
    }))
    .sort((a, b) => b.value - a.value)
}

/** 향후 12개월 실제 결제 예정 금액 (주기 반영) */
export function forecastSeries(subs, settings, months = 12) {
  const keys = monthKeys(months, new Date(), true)
  const buckets = Object.fromEntries(keys.map((k) => [k, 0]))
  for (const s of subs) {
    if (s.status === STATUS.CANCELLED) continue
    if (!s.nextBilling) continue
    let cur = rollForward(s.nextBilling, s.cycle)
    const amount = s.currency === 'USD' ? s.amount * settings.usdRate : s.amount
    if (!amount) continue
    let guard = 0
    while (cur && guard < 60) {
      const k = cur.slice(0, 7)
      if (k in buckets) buckets[k] += amount
      if (k > keys[keys.length - 1]) break
      const [y, m, d] = cur.split('-').map(Number)
      const nd = new Date(y, m - 1, d)
      if (s.cycle === 'weekly') nd.setDate(nd.getDate() + 7)
      else if (s.cycle === 'quarterly') nd.setMonth(nd.getMonth() + 3)
      else if (s.cycle === 'yearly') nd.setFullYear(nd.getFullYear() + 1)
      else nd.setMonth(nd.getMonth() + 1)
      cur = todayIso(nd)
      guard += 1
    }
  }
  return keys.map((k) => ({
    key: k,
    month: `${Number(k.split('-')[1])}월`,
    amount: Math.round(buckets[k]),
  }))
}

/** 낭비 지수: 미사용 기간 대비 월 요금 */
export function wasteRanking(subs, settings) {
  return subs
    .filter((s) => s.status !== STATUS.CANCELLED && s.lastUsed)
    .map((s) => {
      const unused = Math.max(0, -dday(s.lastUsed))
      const m = monthlyKRW(s, settings.usdRate)
      return {
        id: s.id,
        name: s.name,
        unused,
        monthly: Math.round(m),
        waste: Math.round((unused / 30.44) * m),
      }
    })
    .filter((r) => r.waste > 0)
    .sort((a, b) => b.waste - a.waste)
    .slice(0, 8)
}

export function upcomingWithin(subs, settings, days) {
  const t = todayIso()
  return subs.filter((s) => {
    if (s.status === STATUS.CANCELLED) return false
    const u = urgencyOf(s, settings)
    return u.dday !== null && u.dday >= 0 && u.dday <= days
  })
}
