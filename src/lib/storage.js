/** localStorage 영속화 계층 (단일 사용자 · 외부 전송 없음) */

import { SERVICE_MAP } from '../data/services.js'
import { todayIso, addCycle, rollForward } from './dates.js'

const KEY = 'subclean.state.v1'

export const STATUS = {
  ACTIVE: 'active',       // 구독 중 (검토 대상)
  CANCELLING: 'cancelling', // 해지 진행 중
  CANCELLED: 'cancelled', // 해지 완료 → 절감 반영
  KEPT: 'kept',           // 유지 결정 (스누즈/보류)
}

export const STATUS_LABEL = {
  active: '구독 중',
  cancelling: '해지 진행 중',
  cancelled: '해지 완료',
  kept: '유지 결정',
}

export const DEFAULT_SETTINGS = {
  usdRate: 1380,
  alertDays: 7,      // D-N 이내를 "노란사과(주의)" 이상으로 본다
  warnDays: 14,      // D-N 이내를 관찰 대상으로 본다
  theme: 'light',    // 🍎 Cute Apple Theme 기본값 (상아색 배경)
  themeV2: true,
  browserNotify: false,
}

let seq = Date.now()
export function uid(prefix = 'sub') {
  seq += 1
  return `${prefix}_${seq.toString(36)}`
}

export function emptyState() {
  return { version: 1, subscriptions: [], settings: { ...DEFAULT_SETTINGS }, activity: [] }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
    // 구 다크 테마에서 저장된 값은 사과 테마(상아색)로 1회 마이그레이션
    if (!parsed.settings?.themeV2) {
      settings.theme = 'light'
      settings.themeV2 = true
    }
    return {
      version: 1,
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      settings,
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
    }
  } catch {
    return null
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clearState() {
  localStorage.removeItem(KEY)
}

/** 파싱 결과 → 구독 레코드 */
export function subscriptionFromParsed(p) {
  const svc = p.serviceId ? SERVICE_MAP[p.serviceId] : null
  const stepCount = svc?.steps?.length ?? 0
  const next = p.nextBilling
    ? rollForward(p.nextBilling, p.cycle)
    : p.lastPaid
      ? addCycle(p.lastPaid, p.cycle, 1)
      : null

  return {
    id: uid(),
    serviceId: p.serviceId,
    name: p.name,
    category: p.category,
    amount: p.amount,
    currency: p.currency,
    cycle: p.cycle,
    nextBilling: next,
    trialEnd: p.trialEnd || null,
    lastPaid: p.lastPaid || null,
    status: STATUS.ACTIVE,
    source: 'parse',
    messageType: p.messageType,
    confidence: p.confidence,
    steps: Array(stepCount).fill(false),
    snoozeUntil: null,
    notes: '',
    evidence: '',
    cancelledAt: null,
    lastUsed: null,
    createdAt: todayIso(),
    rawSnippet: p.raw.slice(0, 400),
  }
}

export function blankSubscription() {
  return {
    id: uid(),
    serviceId: null,
    name: '',
    category: 'etc',
    amount: null,
    currency: 'KRW',
    cycle: 'monthly',
    nextBilling: null,
    trialEnd: null,
    lastPaid: null,
    status: STATUS.ACTIVE,
    source: 'manual',
    messageType: 'unknown',
    confidence: 1,
    steps: [],
    snoozeUntil: null,
    notes: '',
    evidence: '',
    cancelledAt: null,
    lastUsed: null,
    createdAt: todayIso(),
    rawSnippet: '',
  }
}

/** 서비스 사전과 연결되면 체크리스트 길이를 맞춰준다 */
export function syncSteps(sub) {
  const svc = sub.serviceId ? SERVICE_MAP[sub.serviceId] : null
  const need = svc?.steps?.length ?? 0
  if ((sub.steps?.length ?? 0) === need) return sub
  const steps = Array(need).fill(false)
  ;(sub.steps || []).forEach((v, i) => {
    if (i < need) steps[i] = v
  })
  return { ...sub, steps }
}

/** 중복 등록 판정: 같은 서비스(또는 같은 이름) + 같은 주기 */
export function findDuplicate(subs, candidate) {
  return subs.find((s) => {
    if (s.status === STATUS.CANCELLED) return false
    if (candidate.serviceId && s.serviceId) return s.serviceId === candidate.serviceId
    return s.name.trim().toLowerCase() === candidate.name.trim().toLowerCase()
  })
}

export function logActivity(activity, type, message) {
  return [{ id: uid('log'), at: new Date().toISOString(), type, message }, ...activity].slice(0, 200)
}
