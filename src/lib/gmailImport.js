/** 실제 Gmail 분석 결과 → 구독 레코드 변환 & 마감 알림 */

import { MY_SUBSCRIPTIONS } from '../data/myGmail.js'
import { blankSubscription, syncSteps, findDuplicate, STATUS } from './storage.js'
import { dday, formatDday, formatMoney, rollForward } from './dates.js'

/** 내 Gmail에서 찾은 구독을 앱 레코드로 변환 */
export function buildGmailSubscriptions(existing = []) {
  const fresh = []
  const updates = []   // 데모 사과 → 실제 메일 데이터로 덮어쓰기
  let duplicates = 0

  for (const m of MY_SUBSCRIPTIONS) {
    const candidate = { serviceId: m.serviceId, name: m.name }
    const dup = findDuplicate(existing, candidate)

    const payload = {
      serviceId: m.serviceId,
      name: m.name,
      category: m.category,
      amount: m.amount,
      currency: m.currency || 'KRW',
      cycle: m.cycle || 'monthly',
      nextBilling: m.nextBilling && m.cycle ? rollForward(m.nextBilling, m.cycle) : m.nextBilling,
      lastPaid: m.lastPaid,
      trialEnd: m.trialEnd,
      source: 'gmail',
      confidence: m.confidence === 'confirmed' ? 0.99 : m.confidence === 'partial' ? 0.6 : 0.3,
      evidence: m.facts[0] || '',
      notes: [
        '📧 메일에서 확인된 사실',
        ...m.facts.map((f) => `· ${f}`),
        ...(m.unknown.length
          ? ['', '❓ 메일로는 확인할 수 없는 것 (직접 확인 필요)', ...m.unknown.map((u) => `· ${u}`)]
          : []),
      ].join('\n'),
      rawSnippet:
        `[Gmail 분석 근거 — 메일 원문은 저장하지 않았습니다]\n`
        + m.facts.map((f) => `· ${f}`).join('\n')
        + `\n\n메시지 ID: ${m.sourceMessageIds.join(', ')}`,
    }

    if (dup) {
      // 데모 시드는 실데이터로 교체, 사용자가 직접 넣은 건 손대지 않는다
      if (dup.source === 'seed') updates.push({ id: dup.id, patch: payload, name: m.name })
      else duplicates += 1
      continue
    }

    const base = blankSubscription()
    fresh.push(syncSteps({ ...base, ...payload, status: STATUS.ACTIVE }))
  }

  return { fresh, updates, duplicates }
}

/** 남은 해지기간이 임박한 구독을 브라우저 알림으로 알려준다 */
export async function notifyDeadlines(subs, settings, { force = false } = {}) {
  if (typeof Notification === 'undefined') {
    return { ok: false, reason: 'unsupported' }
  }

  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: 'denied' }

  const targets = subs
    .filter((s) => s.status !== STATUS.CANCELLED)
    .map((s) => {
      const t = s.trialEnd && dday(s.trialEnd) >= 0 ? s.trialEnd : s.nextBilling
      return { sub: s, d: dday(t), target: t }
    })
    .filter((x) => x.d !== null && x.d >= 0 && (force || x.d <= settings.alertDays))
    .sort((a, b) => a.d - b.d)

  if (!targets.length) {
    new Notification('🍏 SubClean · 오늘은 조용해요', {
      body: '해지 기한이 임박한 구독이 없어요. 사과가 모두 건강합니다 😊',
    })
    return { ok: true, count: 0 }
  }

  const head = targets[0]
  const lines = targets.slice(0, 4).map((x) => {
    const emoji = x.d <= 0 ? '🖤' : x.d <= 2 ? '🍎' : x.d <= 7 ? '🟡' : '🍏'
    return `${emoji} ${x.sub.name} · ${formatDday(x.d)} (${formatMoney(x.sub.amount, x.sub.currency)})`
  })

  new Notification(
    head.d <= 0
      ? '🚨 오늘 결제돼요! 지금 해지하세요'
      : `⏰ ${formatDday(head.d)} · ${head.sub.name} 자동결제 임박`,
    {
      body: lines.join('\n') + (targets.length > 4 ? `\n외 ${targets.length - 4}건` : ''),
      tag: 'subclean-deadline',
      requireInteraction: head.d <= 1,
    },
  )

  return { ok: true, count: targets.length }
}

/** 알림 없이 화면에 띄울 "남은 해지기간" 요약 */
export function deadlineSummary(subs, settings) {
  return subs
    .filter((s) => s.status !== STATUS.CANCELLED)
    .map((s) => {
      const target = s.trialEnd && dday(s.trialEnd) >= 0 ? s.trialEnd : s.nextBilling
      const d = dday(target)
      return {
        id: s.id,
        name: s.name,
        amount: s.amount,
        currency: s.currency,
        target,
        d,
        level: d === null ? 'none' : d <= 0 ? 'poison' : d <= 2 ? 'red' : d <= settings.alertDays ? 'yellow' : 'green',
      }
    })
    .sort((a, b) => {
      if (a.d === null) return 1
      if (b.d === null) return -1
      return a.d - b.d
    })
}
