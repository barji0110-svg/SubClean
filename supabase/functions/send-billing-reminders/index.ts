/**
 * 결제 임박 알림 발송 (매일 1회 cron 실행)
 *
 * 앱이 닫혀 있어도 결제 전에 알려주기 위한 서버 측 발송기.
 * 클라이언트의 Notification API 는 앱이 열려 있을 때만 동작하므로
 * "결제 전에 알려준다"는 이 앱의 핵심 가치는 여기서만 성립한다.
 *
 * 흐름
 *   1. 한국 날짜 기준 D-3 / D-1 / D-DAY 인 구독을 모은다
 *   2. 사용자별로 묶어 하루 한 통만 보낸다 (여러 건이면 요약)
 *   3. 만료된 구독 엔드포인트(404/410)는 정리한다
 *   4. push_log 에 기록해 같은 날 중복 발송을 막는다
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@subclean.app'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

/** 한국 시간 기준 오늘. 서버는 UTC 라 그냥 쓰면 밤에 하루가 어긋난다. */
function seoulToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return ''
  if (currency === 'USD') return `$${Number(amount).toFixed(2)}`
  return `${Math.round(Number(amount)).toLocaleString('ko-KR')}원`
}

/** 가장 급한 건을 앞세운 알림 문구 */
function buildMessage(items: Array<{ name: string; amount: number | null; currency: string | null; days: number }>) {
  items.sort((a, b) => a.days - b.days)
  const head = items[0]
  const money = formatMoney(head.amount, head.currency)
  const when = head.days === 0 ? '오늘' : `${head.days}일 뒤`

  const title =
    head.days === 0 ? '🚨 오늘 결제돼요' : head.days === 1 ? '🍎 내일 결제됩니다' : '🍎 결제가 다가와요'

  let body = money
    ? `${head.name} ${money} · ${when} 결제`
    : `${head.name} · ${when} 결제`

  if (items.length > 1) body += ` (외 ${items.length - 1}건)`
  body += '\n해지하려면 지금이 기회예요.'

  return { title, body }
}

Deno.serve(async (req) => {
  // cron 외의 호출을 막는다. verify_jwt 만으로는 anon key 를 가진 누구나 호출할 수 있다.
  if (CRON_SECRET) {
    const provided = req.headers.get('x-cron-secret')
    if (provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const today = seoulToday()
  const targets: Record<string, number> = {
    [today]: 0,
    [addDays(today, 1)]: 1,
    [addDays(today, 3)]: 3,
  }

  // 1) 알림 대상 구독
  const { data: subs, error: subsErr } = await db
    .from('subscriptions')
    .select('id, user_id, plan_name, price, currency, next_billing_date, status, snooze_until')
    .in('next_billing_date', Object.keys(targets))
    .in('status', ['active', 'cancelling', 'kept'])

  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 스누즈 중인 건 제외 (사용자가 "나중에 보자"고 한 것)
  const active = (subs ?? []).filter((s) => !s.snooze_until || s.snooze_until <= today)

  if (active.length === 0) {
    return new Response(JSON.stringify({ ok: true, today, candidates: 0, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2) 사용자별로 묶는다 — 하루에 여러 통을 보내면 알림을 꺼버린다
  const byUser = new Map<string, typeof active>()
  for (const s of active) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  let sent = 0
  let removed = 0
  const skipped: string[] = []

  for (const [userId, items] of byUser) {
    // 3) 같은 날 중복 발송 방지
    const { data: logged } = await db
      .from('push_log')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', 'daily')
      .eq('sent_on', today)
      .maybeSingle()

    if (logged) {
      skipped.push(userId)
      continue
    }

    const { data: endpoints } = await db
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (!endpoints || endpoints.length === 0) continue

    const { title, body } = buildMessage(
      items.map((s) => ({
        name: s.plan_name || '구독',
        amount: s.price,
        currency: s.currency,
        days: targets[s.next_billing_date!],
      })),
    )

    const payload = JSON.stringify({ title, body, url: '/', tag: 'subclean-billing' })

    let deliveredToUser = false

    for (const ep of endpoints) {
      try {
        await webpush.sendNotification(
          { endpoint: ep.endpoint, keys: { p256dh: ep.p256dh, auth: ep.auth } },
          payload,
        )
        deliveredToUser = true
        sent += 1
        await db
          .from('push_subscriptions')
          .update({ last_sent_at: new Date().toISOString() })
          .eq('id', ep.id)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // 404/410 = 브라우저가 구독을 폐기함. 남겨두면 매일 실패하므로 지운다.
        if (status === 404 || status === 410) {
          await db.from('push_subscriptions').delete().eq('id', ep.id)
          removed += 1
        } else {
          console.error(`[push] 발송 실패 user=${userId} status=${status}`, e)
        }
      }
    }

    // 한 기기라도 성공했을 때만 기록한다. 전부 실패했는데 기록하면
    // 다음 실행에서 중복으로 판단해 영영 다시 시도하지 않는다.
    if (deliveredToUser) {
      await db.from('push_log').insert({ user_id: userId, kind: 'daily', sent_on: today })
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      today,
      candidates: active.length,
      users: byUser.size,
      sent,
      removedStaleEndpoints: removed,
      skippedAlreadySent: skipped.length,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
