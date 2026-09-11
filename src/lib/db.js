import { supabase, isSupabaseConfigured } from './supabase.js'
const configured = () => isSupabaseConfigured()

/* ── helpers ── */
function mapRow(row) {
  if (!row) return null
  return { ...row }
}

function mapRows(rows) {
  return (rows || []).map(mapRow)
}

/* ── service_catalog ── */
export async function getServiceCatalog() {
  if (!configured() || !supabase) return []
  const { data, error } = await supabase.from('service_catalog').select('*').eq('is_active', true).order('service_name')
  if (error) throw error
  return mapRows(data)
}

/* ── subscriptions ──
 *
 * ⚠️ 아래 구독 CRUD 는 **쓰지 말 것.** 구독 저장의 단일 출처는 `lib/subsSync.js` 다.
 * 여기 매핑에는 category · notes · steps · evidence · rawSnippet 등이 빠져 있어서,
 * 이걸로 저장하면 해지 체크리스트 진행도와 메모가 조용히 사라진다.
 */
export async function getSubscriptions(userId) {
  if (!configured() || !supabase) return []
  const { data, error } = await supabase.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return mapRows(data)
}

export async function getSubscription(id) {
  if (!configured() || !supabase) return null
  const { data, error } = await supabase.from('subscriptions').select('*').eq('id', id).single()
  if (error) throw error
  return mapRow(data)
}

export async function createSubscription(userId, sub) {
  if (!configured() || !supabase) return null
  const { data, error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    service_id: sub.serviceId,
    plan_name: sub.planName || sub.name,
    price: sub.amount,
    currency: sub.currency || 'KRW',
    billing_cycle: sub.cycle || 'monthly',
    status: sub.status || 'active',
    next_billing_date: sub.nextBilling,
    trial_end_date: sub.trialEnd,
    cancel_at_period_end: sub.cancelAtPeriodEnd || false,
    data_source: sub.source || 'manual',
    sync_status: 'success',
  }).select().single()
  if (error) throw error
  return mapRow(data)
}

export async function updateSubscription(id, patch) {
  if (!configured() || !supabase) return null
  const { data, error } = await supabase.from('subscriptions').update(patch).eq('id', id).select().single()
  if (error) throw error
  return mapRow(data)
}

export async function deleteSubscription(id) {
  if (!configured() || !supabase) return
  const { error } = await supabase.from('subscriptions').delete().eq('id', id)
  if (error) throw error
}

/* ── subscription_events ── */
export async function getSubscriptionEvents(userId, subscriptionId) {
  if (!configured() || !supabase) return []
  let query = supabase.from('subscription_events').select('*').eq('user_id', userId)
  if (subscriptionId) query = query.eq('subscription_id', subscriptionId)
  const { data, error } = await query.order('event_date', { ascending: false })
  if (error) throw error
  return mapRows(data)
}

export async function createEvent(userId, event) {
  if (!configured() || !supabase) return null
  const { data, error } = await supabase.from('subscription_events').insert({
    user_id: userId,
    subscription_id: event.subscriptionId,
    event_type: event.eventType,
    event_date: event.eventDate,
    amount: event.amount,
    currency: event.currency,
    email_message_id: event.emailMessageId,
  }).select().single()
  if (error) throw error
  return mapRow(data)
}

/* ── transactions ── */
export async function getTransactions(userId) {
  if (!configured() || !supabase) return []
  const { data, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('paid_at', { ascending: false })
  if (error) throw error
  return mapRows(data)
}

export async function createTransaction(userId, tx) {
  if (!configured() || !supabase) return null
  const { data, error } = await supabase.from('transactions').insert({
    user_id: userId,
    service_id: tx.serviceId,
    transaction_type: tx.transactionType || 'subscription',
    amount: tx.amount,
    currency: tx.currency,
    paid_at: tx.paidAt,
    source: tx.source || 'email',
  }).select().single()
  if (error) throw error
  return mapRow(data)
}

/* ── delivery_orders ── */
export async function getDeliveryOrders(userId) {
  if (!configured() || !supabase) return []
  const { data, error } = await supabase.from('delivery_orders').select('*').eq('user_id', userId).order('ordered_at', { ascending: false })
  if (error) throw error
  return mapRows(data)
}

export async function createDeliveryOrder(userId, order) {
  if (!configured() || !supabase) return null
  const { data, error } = await supabase.from('delivery_orders').insert({
    user_id: userId,
    ordered_at: order.orderedAt,
    restaurant_name: order.restaurantName,
    order_amount: order.orderAmount,
    delivery_fee: order.deliveryFee,
    discount_amount: order.discountAmount,
    payment_amount: order.paymentAmount,
    source: order.source || 'email',
  }).select().single()
  if (error) throw error
  return mapRow(data)
}

/* ── service_connections ── */
export async function getServiceConnections(userId) {
  if (!configured() || !supabase) return []
  const { data, error } = await supabase.from('service_connections').select('*').eq('user_id', userId)
  if (error) throw error
  return mapRows(data)
}

export async function upsertConnection(userId, connection) {
  if (!configured() || !supabase) return null
  const { data: existing } = await supabase
    .from('service_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', connection.provider)
    .maybeSingle()

  const payload = {
    user_id: userId,
    provider: connection.provider,
    connection_type: connection.connectionType || 'oauth',
    status: connection.status || 'active',
    external_account_id: connection.externalAccountId,
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expires_at: connection.expiresAt,
  }

  if (existing) {
    const { data, error } = await supabase.from('service_connections').update(payload).eq('id', existing.id).select().single()
    if (error) throw error
    return mapRow(data)
  } else {
    const { data, error } = await supabase.from('service_connections').insert(payload).select().single()
    if (error) throw error
    return mapRow(data)
  }
}

/* ── local ↔ supabase sync ──
 *
 * (제거됨) syncLocalToSupabase — `lib/subsSync.js` 가 대체한다.
 *
 * 옛 구현은 serviceId 로만 대조해서 같은 서비스를 두 번 담으면 구분하지 못했고,
 * 무엇보다 **로그인 직후 한 번만** 돌아서 그 뒤의 추가·수정·삭제가 클라우드에
 * 반영되지 않았다. 두 구현이 공존하면 같은 버그를 다시 부르므로 지웠다.
 */
