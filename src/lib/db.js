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

/* ── subscriptions ── */
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

/* ── local ↔ supabase sync ── */
export async function syncLocalToSupabase(userId, localSubs) {
  const dbSubs = await getSubscriptions(userId)
  const dbMap = new Map(dbSubs.map((s) => [s.service_id, s]))

  const results = { created: 0, updated: 0, skipped: 0 }
  for (const local of localSubs) {
    const existing = dbMap.get(local.serviceId)
    if (existing) {
      if (existing.last_synced_at && new Date(local.updatedAt || local.createdAt) <= new Date(existing.last_synced_at)) {
        results.skipped += 1
        continue
      }
      await updateSubscription(existing.id, {
        plan_name: local.planName || local.name,
        price: local.amount,
        currency: local.currency,
        status: local.status,
        next_billing_date: local.nextBilling,
        trial_end_date: local.trialEnd,
        last_synced_at: new Date().toISOString(),
      })
      results.updated += 1
    } else {
      await createSubscription(userId, local)
      results.created += 1
    }
  }
  return results
}
