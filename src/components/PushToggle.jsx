import { useEffect, useState } from 'react'
import { enablePush, disablePush, getExistingSubscription, permissionState, pushSupport } from '../lib/push.js'

/**
 * 서버 푸시 알림 토글.
 *
 * 기존 "브라우저 알림"과 다른 점을 사용자가 알아야 한다:
 *   - 브라우저 알림 = 앱이 **열려 있을 때만** 뜬다
 *   - 이 알림   = 앱을 닫아도 서버가 결제 전에 보낸다
 */
export default function PushToggle({ user, notify }) {
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [support] = useState(() => pushSupport())
  const [permission, setPermission] = useState(() => permissionState())

  useEffect(() => {
    let alive = true
    getExistingSubscription()
      .then((s) => { if (alive) setSubscribed(Boolean(s)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const toggle = async () => {
    if (!user) { notify('로그인해야 알림을 받을 수 있어요'); return }
    setBusy(true)
    try {
      if (subscribed) {
        await disablePush(user.id)
        setSubscribed(false)
        notify('결제 알림을 껐어요')
      } else {
        await enablePush(user.id)
        setSubscribed(true)
        setPermission(permissionState())
        notify('🔔 결제 알림을 켰어요. 결제 3일 전부터 알려드릴게요')
      }
    } catch (e) {
      notify(`알림 설정 실패 — ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 4 }}>
        📬 결제일 푸시 알림
      </div>
      <div style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>
        앱을 닫아놔도 <b>결제 3일 전 · 하루 전 · 당일</b>에 알려드려요.
      </div>

      {!support.ok ? (
        <div className="trap" style={{ marginBottom: 4 }}>
          <span>⚠️</span><span>{support.reason}</span>
        </div>
      ) : permission === 'denied' ? (
        <div className="trap" style={{ marginBottom: 4 }}>
          <span>🔕</span>
          <span>알림이 차단돼 있어요. 주소창의 자물쇠 → 알림에서 <b>허용</b>으로 바꾼 뒤 다시 시도해주세요.</span>
        </div>
      ) : (
        <button className="btn leaf" onClick={toggle} disabled={busy || !user}>
          {busy ? '⏳ 처리 중...' : subscribed ? '📬 결제 알림 켜짐 — 끄기' : '📬 결제 알림 켜기'}
        </button>
      )}
    </div>
  )
}
