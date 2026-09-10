import { supabase, saveServiceConnection } from './supabase.js'
import { getServiceConnections } from './db.js'

const CONNECT_FLAG = 'gmail_connect_pending'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export function isGmailConnectPending() {
  return localStorage.getItem(CONNECT_FLAG) === 'true'
}

export function clearGmailConnectPending() {
  localStorage.removeItem(CONNECT_FLAG)
}

export async function connectGmail() {
  if (!supabase) return { error: new Error('Supabase not configured') }
  localStorage.setItem(CONNECT_FLAG, 'true')
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: GMAIL_SCOPE,
      redirectTo: window.location.origin,
      // access_type=offline 이 없으면 Google 이 refresh token 을 주지 않아
      // provider_token 이 1시간 뒤 만료되고 매번 다시 연결해야 한다.
      // prompt=consent 는 이미 동의한 계정에도 refresh token 을 재발급시킨다.
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })
}

export async function handleGmailCallback() {
  if (!isGmailConnectPending()) return null
  clearGmailConnectPending()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.provider_token) return { error: 'No provider token after OAuth' }

  const profile = await getProfile(session.provider_token)
  const email = profile?.emailAddress || session.user?.email || 'unknown'

  let warning = null
  try {
    await saveServiceConnection(session.user.id, 'gmail', {
      access_token: session.provider_token,
      refresh_token: session.provider_refresh_token || '',
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    })
  } catch (e) {
    console.error('Failed to persist Gmail connection:', e)
    warning = `연결 정보를 저장하지 못했습니다 (${e.message}). 이번 세션에서만 유지됩니다.`
  }

  if (!session.provider_refresh_token) {
    warning = warning
      || '갱신 토큰을 받지 못해 약 1시간 뒤 다시 연결해야 합니다.'
  }

  return { token: session.provider_token, email, warning }
}

export async function getGmailToken() {
  if (!supabase) return null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) {
      const connections = await getServiceConnections(user.id)
      if (connections.length > 0) {
        const gmail = connections.find(c => c.provider === 'gmail')
        if (gmail?.access_token) return gmail.access_token
      }
    }
  } catch {}
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.provider_token || null
  } catch { return null }
}

export async function getProfile(token) {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function searchEmails(token, query, maxResults = 50) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) })
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.text()
    if (res.status === 401 || res.status === 403) throw new Error('GMAIL_AUTH_FAILED')
    throw new Error(`Gmail API error: ${res.status}`)
  }
  const data = await res.json()
  return data.messages || []
}

export async function getMessage(token, messageId) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('GMAIL_AUTH_FAILED')
    throw new Error(`Gmail API error: ${res.status}`)
  }
  return res.json()
}

export function extractPlainText(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data)
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part)
      if (text) return text
    }
  }
  return ''
}

export function extractHtmlText(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64(payload.body.data)
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractHtmlText(part)
      if (text) return text
    }
  }
  return ''
}

export function getHeader(headers, name) {
  const found = headers?.find(h => h.name.toLowerCase() === name.toLowerCase())
  return found?.value || ''
}

function decodeBase64(data) {
  try {
    const raw = data.replace(/-/g, '+').replace(/_/g, '/')
    return decodeURIComponent(Array.from(atob(raw), c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
  } catch {
    try { return atob(data.replace(/-/g, '+').replace(/_/g, '/')) } catch { return '' }
  }
}
