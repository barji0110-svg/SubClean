const NAV = [
  { id: 'dashboard', icon: '🍎', label: '오늘의 사과바구니', badgeKey: 'criticalCount' },
  { id: 'inbox', icon: '📧', label: '메일함 연결', badgeKey: null },
  { id: 'subs', icon: '🍏', label: '내 구독', badgeKey: 'activeCount', mute: true },
  { id: 'analytics', icon: '🍃', label: '절약 분석', badgeKey: null },
  { id: 'settings', icon: '⚙️', label: '설정', badgeKey: null },
]

export default function Sidebar({ view, setView, sum }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="leaf-logo"><span>SubClean</span></div>
        <div>
          <div className="brand-name">SubClean</div>
          <div className="brand-sub">🍎 나의 구독 사과농장</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-label">🧺 농장 둘러보기</div>
        {NAV.map((n) => {
          const count = n.badgeKey ? sum[n.badgeKey] : 0
          return (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              onClick={() => setView(n.id)}
            >
              <span className="ico">{n.icon}</span>
              <span>{n.label}</span>
              {count > 0 && (
                <span className={`nav-badge ${n.mute ? 'mute' : ''}`}>{count}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-foot">
        🔒 농장 기록은 이 브라우저에만 저장돼요.
        <br />밖으로 나가지 않으니 안심하세요 😊
        <div style={{ marginTop: 8, color: 'var(--text-3)' }}>🍃 v1.1 · Apple Farm</div>
      </div>
    </aside>
  )
}
