import { useState } from 'react'

export default function Settings({ settings, setSettings, resetAll, notify, subs }) {
  const [confirming, setConfirming] = useState(false)

  const askNotify = async () => {
    if (typeof Notification === 'undefined') {
      notify('이 브라우저는 알림을 지원하지 않습니다')
      return
    }
    const p = await Notification.requestPermission()
    if (p === 'granted') {
      setSettings({ browserNotify: true })
      notify('브라우저 알림을 켰습니다')
    } else {
      notify('알림 권한이 거부되었습니다')
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ subscriptions: subs, settings }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subclean-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">⚙️ 농장 설정</h1>
        <p className="page-desc">모든 기록은 이 브라우저에만 저장돼요 🔒 &nbsp;밖으로 나가지 않아요!</p>
      </div>

      <div className="grid c2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">🔔 언제 알려드릴까요?</div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>🚨 "곧 결제돼요" 기준 (D-{settings.alertDays} 이내)</label>
            <input
              className="input" type="number" min="1" max="30"
              value={settings.alertDays}
              onChange={(e) => setSettings({ alertDays: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>🟡 "슬슬 살펴봐요" 기준 (D-{settings.warnDays} 이내)</label>
            <input
              className="input" type="number" min="2" max="60"
              value={settings.warnDays}
              onChange={(e) => setSettings({ warnDays: Math.max(2, Number(e.target.value) || 2) })}
            />
          </div>
          <div className="field">
            <label>💱 USD → KRW 환산율 (직접 입력 · 외부 API 미사용)</label>
            <input
              className="input" type="number" min="1"
              value={settings.usdRate}
              onChange={(e) => setSettings({ usdRate: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="divider" />
          <button className="btn leaf" onClick={askNotify}>
            🔔 브라우저 알림 {settings.browserNotify ? '켜짐 😊' : '켜기'}
          </button>
        </div>

        <div className="card">
          <div className="card-title">🧺 농장 기록 관리</div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 14 }}>
            <button className="btn" onClick={exportJson}>💾 농장 기록 내려받기</button>
          </div>

          <div className="tip">
            <span>🍎</span>
            <span>
              이 앱에는 예시·데모 구독이 없습니다. 바구니에 담긴 사과는
              <b> 실제 메일에서 확인된 것</b>과 <b>직접 등록한 것</b>뿐이에요.
            </span>
          </div>

          <div className="divider" />

          {!confirming ? (
            <button className="btn danger" onClick={() => setConfirming(true)}>🧹 농장 전체 비우기</button>
          ) : (
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--apple)', fontSize: 12.5, fontWeight: 800 }}>
                🥺 사과 {subs.length}알이 모두 사라져요. 되돌릴 수 없어요!
              </span>
              <button className="btn danger sm" onClick={() => { resetAll(); setConfirming(false) }}>네, 비울게요</button>
              <button className="btn ghost sm" onClick={() => setConfirming(false)}>앗, 취소</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
