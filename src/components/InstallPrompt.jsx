import { useEffect, useState } from 'react'
import { isIos, isStandalone } from '../lib/pwa.js'

const DISMISS_KEY = 'subclean.install.dismissed'

/**
 * 홈 화면 설치 안내.
 *
 * 안드로이드·데스크톱 크롬은 `beforeinstallprompt` 를 주므로 버튼 한 번으로 설치된다.
 * **iOS 는 그 이벤트를 지원하지 않아** 사용자가 직접 공유 → 홈 화면에 추가를 해야 한다.
 * iOS 에서 이 안내가 없으면 설치 경로를 아무도 못 찾는다 (푸시 알림도 설치해야 온다).
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === 'true' } catch { return false }
  })

  useEffect(() => {
    if (isStandalone()) return

    const onPrompt = (e) => {
      e.preventDefault()       // 브라우저 기본 배너를 막고 우리가 원하는 자리에서 띄운다
      setDeferred(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS 는 이벤트가 없으므로 직접 판별해 안내를 띄운다
    if (isIos()) setShowIosGuide(true)

    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const close = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISS_KEY, 'true') } catch { /* 사파리 비공개 모드 */ }
  }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    close()
  }

  if (dismissed || isStandalone()) return null
  if (!deferred && !showIosGuide) return null

  return (
    <div className="card" style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      marginBottom: 14, borderColor: 'var(--apple)',
    }}>
      <span style={{ fontSize: 26, lineHeight: 1 }}>🍎</span>

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>홈 화면에 추가하세요</div>
        <div style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 12.5, marginTop: 3 }}>
          {deferred
            ? '앱처럼 바로 열리고, 인터넷이 없어도 구독 목록을 볼 수 있어요.'
            : '공유 버튼 → “홈 화면에 추가”를 누르면 앱처럼 쓸 수 있어요.'}
        </div>
      </div>

      {deferred ? (
        <button className="btn primary sm" onClick={install}>설치하기</button>
      ) : null}
      <button className="btn ghost sm" onClick={close}>나중에</button>
    </div>
  )
}
