/**
 * 웹 푸시 구독 관리
 *
 * 브라우저에서 푸시 구독(endpoint + 암호화 키)을 발급받아 Supabase 에 저장한다.
 * 실제 발송은 Edge Function(send-billing-reminders)이 담당한다.
 */

import { supabase, isSupabaseConfigured } from './supabase.js'
import { isIos, isStandalone } from './pwa.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/** base64url → Uint8Array (applicationServerKey 는 바이트 배열만 받는다) */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/** ArrayBuffer → base64url (서버에 문자열로 저장하기 위해) */
function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 이 환경에서 푸시를 쓸 수 있는지.
 * 불가능한 이유를 함께 돌려줘야 UI 에서 뭘 하라고 안내할 수 있다.
 */
export function pushSupport() {
  if (!('serviceWorker' in navigator)) {
    return { ok: false, reason: '이 브라우저는 서비스워커를 지원하지 않아요.' }
  }
  if (!('PushManager' in window)) {
    return { ok: false, reason: '이 브라우저는 웹 푸시를 지원하지 않아요.' }
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: '푸시 키가 설정되지 않았어요 (VITE_VAPID_PUBLIC_KEY).' }
  }
  // iOS 는 홈 화면에 설치한 경우에만 푸시가 온다. Safari 탭에서는 구독조차 안 된다.
  if (isIos() && !isStandalone()) {
    return {
      ok: false,
      needsInstall: true,
      reason: '아이폰은 홈 화면에 추가한 뒤에만 알림을 받을 수 있어요. 공유 → 홈 화면에 추가를 먼저 해주세요.',
    }
  }
  return { ok: true }
}

export function permissionState() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

/** 현재 기기가 이미 구독 중인가 */
export async function getExistingSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** 구독 객체를 DB 행으로 */
function toRow(userId, sub) {
  const json = typeof sub.toJSON === 'function' ? sub.toJSON() : sub
  const keys = json.keys || {}
  return {
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: keys.p256dh || bufferToBase64Url(sub.getKey?.('p256dh')),
    auth: keys.auth || bufferToBase64Url(sub.getKey?.('auth')),
    user_agent: navigator.userAgent.slice(0, 300),
  }
}

async function saveSubscription(userId, sub) {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase 가 설정되지 않았습니다')
  const row = toRow(userId, sub)
  // endpoint 가 UNIQUE 이므로 재구독·재설치 시 새 행이 쌓이지 않고 갱신된다
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

/**
 * 알림 켜기: 권한 요청 → 구독 발급 → 서버 저장.
 * 실패는 전부 던진다. 호출부가 사용자에게 이유를 보여줘야 하기 때문이다.
 */
export async function enablePush(userId) {
  const support = pushSupport()
  if (!support.ok) throw new Error(support.reason)

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? '알림이 차단돼 있어요. 브라우저 주소창의 자물쇠 → 알림에서 허용으로 바꿔주세요.'
        : '알림 권한이 허용되지 않았어요.',
    )
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      // 표시 없는 무음 푸시는 브라우저가 허용하지 않는다. 반드시 true.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  await saveSubscription(userId, sub)
  return sub
}

/** 알림 끄기: 브라우저 구독 해제 + 서버 행 삭제 */
export async function disablePush(userId) {
  const sub = await getExistingSubscription()
  if (!sub) return

  const endpoint = sub.endpoint
  await sub.unsubscribe()

  if (isSupabaseConfigured() && supabase && userId) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
    if (error) throw new Error(error.message)
  }
}

/**
 * 서비스워커가 구독을 재발급했을 때(pushsubscriptionchange) 서버에 반영한다.
 * 이걸 놓치면 그 기기는 아무 신호 없이 알림이 끊긴다.
 */
export function listenForResubscribe(getUserId) {
  if (!('serviceWorker' in navigator)) return () => {}

  const onMessage = async (event) => {
    if (event.data?.type !== 'PUSH_RESUBSCRIBED') return
    const userId = getUserId()
    if (!userId) return
    try {
      await saveSubscription(userId, event.data.subscription)
    } catch (e) {
      console.error('[push] 재구독 저장 실패:', e)
    }
  }

  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}
