/**
 * 구독 레코드 ↔ Supabase 동기화 계층
 *
 * 설계
 *   - localStorage 가 UI 의 1차 저장소다 (오프라인·비로그인에서도 앱이 돈다).
 *   - 로그인 상태에서는 **로컬 상태 변화를 감지해 원격에 밀어넣는(write-behind)** 방식으로
 *     추가·수정·삭제를 모두 반영한다. 개별 mutation 마다 호출부를 고치지 않아도 된다.
 *   - 로컬 id 를 UUID 로 쓰기 때문에(storage.uid) 로컬 id 가 곧 DB 의 기본키다.
 *     별도 매핑 없이 upsert 한 번으로 생성·갱신이 동시에 처리된다.
 */

import { supabase, isSupabaseConfigured } from './supabase.js'
import { uid, isUuid, STATUS } from './storage.js'

/** 원격에 올리지 않는 출처 (데모 시드는 각 기기의 표시용일 뿐이다) */
const LOCAL_ONLY_SOURCES = new Set(['seed'])

export function isSyncable(sub) {
  return !LOCAL_ONLY_SOURCES.has(sub.source)
}

/* ── 매핑 ───────────────────────────────────────────── */

/** 빈 문자열은 DATE 컬럼에서 오류가 나므로 null 로 정규화한다 */
const d = (v) => (v ? v : null)
const n = (v) => (v === '' || v === undefined ? null : v)

export function toDbRow(userId, s) {
  return {
    id: s.id,
    user_id: userId,
    service_id: s.serviceId || null,
    plan_name: s.name || '',
    category: s.category || null,
    price: n(s.amount),
    currency: s.currency || 'KRW',
    billing_cycle: s.cycle || 'monthly',
    status: s.status || STATUS.ACTIVE,
    next_billing_date: d(s.nextBilling),
    trial_end_date: d(s.trialEnd),
    last_paid: d(s.lastPaid),
    snooze_until: d(s.snoozeUntil),
    cancelled_at: d(s.cancelledAt),
    last_used: d(s.lastUsed),
    cancel_at_period_end: !!s.cancelAtPeriodEnd,
    data_source: s.source || 'manual',
    notes: s.notes || null,
    evidence: s.evidence || null,
    steps: Array.isArray(s.steps) ? s.steps : [],
    raw_snippet: s.rawSnippet || null,
    confidence: n(s.confidence),
    message_type: s.messageType || null,
    last_synced_at: new Date().toISOString(),
    sync_status: 'success',
  }
}

export function fromDbRow(r) {
  return {
    id: r.id,
    serviceId: r.service_id,
    name: r.plan_name || '',
    category: r.category || 'etc',
    amount: r.price === null ? null : Number(r.price),
    currency: r.currency || 'KRW',
    cycle: r.billing_cycle || 'monthly',
    status: r.status || STATUS.ACTIVE,
    nextBilling: r.next_billing_date,
    trialEnd: r.trial_end_date,
    lastPaid: r.last_paid,
    snoozeUntil: r.snooze_until,
    cancelledAt: r.cancelled_at,
    lastUsed: r.last_used,
    cancelAtPeriodEnd: !!r.cancel_at_period_end,
    source: r.data_source || 'manual',
    notes: r.notes || '',
    evidence: r.evidence || '',
    steps: Array.isArray(r.steps) ? r.steps : [],
    rawSnippet: r.raw_snippet || '',
    confidence: r.confidence === null ? 1 : Number(r.confidence),
    messageType: r.message_type || 'unknown',
    createdAt: r.created_at ? String(r.created_at).slice(0, 10) : null,
  }
}

/**
 * 원격 비교용 지문.
 * `createdAt`·`lastSyncedAt` 처럼 왕복 과정에서 형식이 달라지는 필드는 제외한다.
 * 이게 안 맞으면 매 렌더마다 "변경됨"으로 오판해 쓸데없이 upsert 가 돈다.
 */
export function fingerprint(s) {
  return JSON.stringify([
    s.id, s.serviceId, s.name, s.category, s.amount, s.currency, s.cycle,
    s.status, s.nextBilling, s.trialEnd, s.lastPaid, s.snoozeUntil,
    s.cancelledAt, s.lastUsed, s.source, s.notes, s.evidence,
    s.steps, s.rawSnippet, s.confidence,
  ])
}

/* ── 원격 연산 ──────────────────────────────────────── */

function client() {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase 가 설정되지 않았습니다')
  return supabase
}

export async function fetchSubscriptions(userId) {
  const { data, error } = await client()
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []).map(fromDbRow)
}

/**
 * 변경분을 원격에 반영한다.
 * upsert 는 기본키(id) 충돌 시 갱신이므로 생성·수정이 한 번에 처리된다.
 */
export async function pushChanges(userId, upserts = [], deleteIds = []) {
  const db = client()

  const rows = upserts.filter(isSyncable).map((s) => toDbRow(userId, s))
  if (rows.length) {
    const { error } = await db.from('subscriptions').upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`저장 실패: ${error.message}`)
  }

  if (deleteIds.length) {
    // user_id 조건은 RLS 가 이미 강제하지만, 명시해 두면 실수로 남의 행을
    // 지우려는 쿼리가 애초에 만들어지지 않는다.
    const { error } = await db
      .from('subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('id', deleteIds)
    if (error) throw new Error(`삭제 실패: ${error.message}`)
  }

  return { upserted: rows.length, deleted: deleteIds.length }
}

/**
 * 로그인 직후 1회: 원격과 로컬을 합친다.
 *
 * - 원격 행이 기준이 된다 (다른 기기에서 만든 것 포함).
 * - 로컬에만 있는 항목은 올린다. 단 같은 서비스/이름이 원격에 이미 있으면 중복이므로 건너뛴다.
 * - 구버전 `sub_xxx` id 는 UUID 로 갈아끼운다. 그래야 DB 에 들어간다.
 */
export async function mergeOnLogin(userId, localSubs) {
  const remote = await fetchSubscriptions(userId)

  const remoteIds = new Set(remote.map((r) => r.id))
  const remoteKeys = new Set(
    remote
      .filter((r) => r.status !== STATUS.CANCELLED)
      .map((r) => (r.serviceId ? `svc:${r.serviceId}` : `name:${r.name.trim().toLowerCase()}`)),
  )

  const toPush = []
  for (const s of localSubs) {
    if (!isSyncable(s)) continue
    const normalized = isUuid(s.id) ? s : { ...s, id: uid() }
    if (remoteIds.has(normalized.id)) continue

    const key = normalized.serviceId
      ? `svc:${normalized.serviceId}`
      : `name:${(normalized.name || '').trim().toLowerCase()}`
    if (normalized.status !== STATUS.CANCELLED && remoteKeys.has(key)) continue

    toPush.push(normalized)
    remoteKeys.add(key)
  }

  if (toPush.length) await pushChanges(userId, toPush, [])

  return { merged: [...remote, ...toPush], pulled: remote.length, pushed: toPush.length }
}
