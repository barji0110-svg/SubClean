import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export let supabase = null

if (supabaseUrl && supabaseUrl !== 'https://your-project.supabase.co') {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}

export const isSupabaseConfigured = () => supabase !== null
export const isConfigured = () => supabase !== null

export async function fetchSubscriptions(userId) {
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('next_billing_date', { ascending: true })
  if (error) {
    console.error('[Supabase] fetchSubscriptions error:', error)
    return []
  }
  return data.map(mapDbSubToLocal)
}

export async function saveSubscription(userId, sub) {
  if (!supabase || !userId) return null
  const dbSub = mapLocalSubToDb(userId, sub)
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(dbSub)
    .select()
    .single()
  if (error) {
    console.error('[Supabase] saveSubscription error:', error)
    return null
  }
  return mapDbSubToLocal(data)
}

export async function deleteSubscription(userId, subId) {
  if (!supabase || !userId) return false
  const { error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('id', subId)
    .eq('user_id', userId)
  if (error) {
    console.error('[Supabase] deleteSubscription error:', error)
    return false
  }
  return true
}

export async function fetchServiceCatalog() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('service_catalog')
    .select('*')
    .eq('is_active', true)
  if (error) {
    console.error('[Supabase] fetchServiceCatalog error:', error)
    return []
  }
  return data
}

export async function saveServiceConnection(userId, provider, tokens) {
  if (!supabase || !userId) return null
  const { data, error } = await supabase
    .from('service_connections')
    .upsert({
      user_id: userId,
      provider,
      connection_type: 'oauth',
      status: 'connected',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      last_synced_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) {
    // 조용히 null 을 돌려주면 호출부가 "저장됐다"고 오해한다. 호출부가 사용자에게
    // 알릴 수 있도록 반드시 던진다. (gmailApi.handleGmailCallback 에서 처리)
    console.error('[Supabase] saveServiceConnection error:', error)
    throw new Error(error.message || '연결 정보 저장 실패')
  }
  return data
}

export async function saveSubscriptionEvent(userId, event) {
  if (!supabase || !userId) return null
  const { data, error } = await supabase
    .from('subscription_events')
    .insert({
      user_id: userId,
      subscription_id: event.subscriptionId,
      event_type: event.eventType,
      event_date: event.eventDate,
      amount: event.amount,
      currency: event.currency,
      email_message_id: event.emailMessageId,
    })
    .select()
    .single()
  if (error) {
    console.error('[Supabase] saveSubscriptionEvent error:', error)
    return null
  }
  return data
}

function mapDbSubToLocal(db) {
  return {
    id: db.id,
    serviceId: db.service_id,
    name: db.plan_name || '',
    category: '',
    amount: db.price,
    currency: db.currency || 'KRW',
    cycle: db.billing_cycle || 'monthly',
    nextBilling: db.next_billing_date,
    trialEnd: db.trial_end_date,
    lastPaid: null,
    status: db.status || 'active',
    source: db.data_source || 'manual',
    snoozeUntil: null,
    notes: '',
    evidence: '',
    cancelledAt: null,
    lastUsed: null,
    createdAt: db.created_at,
    steps: [],
    rawSnippet: '',
    confidence: 1,
    dataSource: db.data_source,
    lastSyncedAt: db.last_synced_at,
    syncStatus: db.sync_status,
    cancelAtPeriodEnd: db.cancel_at_period_end,
  }
}

function mapLocalSubToDb(userId, sub) {
  return {
    user_id: userId,
    service_id: sub.serviceId || null,
    plan_name: sub.name,
    price: sub.amount,
    currency: sub.currency || 'KRW',
    billing_cycle: sub.cycle || 'monthly',
    status: sub.status || 'active',
    next_billing_date: sub.nextBilling || null,
    trial_end_date: sub.trialEnd || null,
    data_source: sub.source || 'manual',
    cancel_at_period_end: sub.cancelAtPeriodEnd || false,
  }
}

// (제거됨) _gmailSignIn — 아무 데서도 import 하지 않는 죽은 코드였고,
// redirectTo 가 '/gmail-callback' 이라 정적 호스팅에서 404 가 나는 지뢰였다.
// Gmail 연결은 gmailApi.js 의 connectGmail() 을 쓴다.