import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'

import { monthlySeries, URGENCY, isSnoozed, urgencyOf } from '../lib/analytics.js'
import { STATUS, STATUS_LABEL } from '../lib/storage.js'
import {
  formatKRW, formatDday, formatKDate, formatShortDate, formatMoney, CYCLE_LABEL, dday,
} from '../lib/dates.js'
import { SERVICE_MAP, DIFFICULTY_LABEL } from '../data/services.js'
import { downloadIcs } from '../lib/calendar.js'
import { notifyDeadlines } from '../lib/gmailImport.js'
import { getGmailToken, getProfile } from '../lib/gmailApi.js'
import { upcomingWithin } from '../lib/analytics.js'

/* 결제일이 가까울수록 사과를 더 베어 먹은 단계(표시용 파생값 · 로직 불변) */
function biteStage(dd) {
  if (dd === null || dd === undefined) return 'whole'
  if (dd <= 0) return 'core'   // 오늘/독사과 — 심만 남음
  if (dd <= 2) return 'b3'     // 임박 — 크게 베어 문
  if (dd <= 7) return 'b2'     // 이번 주 — 두 입
  if (dd <= 14) return 'b1'    // 슬슬 — 한 입
  return 'whole'               // 여유 — 온전한 사과
}

/* 사과 껍질 색 (상태별) */
const APPLE_SKIN = {
  green: { a: '#7FD98C', b: '#57C070', c: '#3E8C5A' },
  yellow: { a: '#FFEE7A', b: '#F5E020', c: '#D9C000' },
  red: { a: '#F79289', b: '#F1685E', c: '#D8443A' },
  poison: { a: '#5C5A62', b: '#3A3A3A', c: '#1B1B1B' },
  none: { a: '#E3D6C6', b: '#CDBBA8', c: '#B29B82' },
}
const APPLE_FLESH = '#FFF3DE'
// 정원형에 가까운 사과 실루엣. 결제일은 베어 문 정도로만 표현한다.
const APPLE_BODY = 'M60 38 C46 25 28 30 24 48 C20 68 27 95 46 105 C54 110 66 110 74 105 C93 95 100 68 96 48 C92 30 74 25 60 38 Z'
const APPLE_BITES = {
  whole: [],
  b1: [[101, 50, 15]],
  b2: [[103, 56, 22], [78, 31, 13]],
  b3: [[95, 62, 31], [69, 33, 18]],
}

/* 🍎 SVG 사과 — bite 단계가 커질수록 껍질을 파내 속살·심을 드러냄 */
function AppleSvg({ level, bite }) {
  const sk = APPLE_SKIN[level] || APPLE_SKIN.none
  const uid = `${level}-${bite}`

  const Stem = (
    <>
      <path d="M60 40 C60 28 63 20 69 15" stroke="#7A5A3A" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M69 20 C82 10 96 15 95 27 C84 36 71 31 69 20 Z" fill="#57C070" />
      <path d="M71 24 C80 20 88 22 92 26" stroke="#3E8C5A" strokeWidth="1.6" fill="none" opacity="0.7" />
    </>
  )

  if (bite === 'core') {
    const cs = sk.b
    return (
      <svg viewBox="0 0 120 132" className="apple-svg" role="img">
        {Stem}
        <path d="M46 44 C41 62 41 72 47 88 C37 97 40 107 52 113 L68 113 C80 107 83 97 73 88 C79 72 79 62 74 44 Z"
          fill={cs} stroke="#1B1B1B" strokeWidth="2" />
        <path d="M45 47 C40 41 80 41 75 47 C68 52 52 52 45 47 Z" fill={cs} opacity="0.9" />
        <path d="M50 111 C46 118 74 118 70 111 C63 115 57 115 50 111 Z" fill={cs} opacity="0.85" />
        <ellipse cx="55" cy="74" rx="3.2" ry="5" fill="#F4DDBE" transform="rotate(-16 55 74)" />
        <ellipse cx="65" cy="74" rx="3.2" ry="5" fill="#F4DDBE" transform="rotate(16 65 74)" />
      </svg>
    )
  }

  const bites = APPLE_BITES[bite] || []
  return (
    <svg viewBox="0 0 120 132" className="apple-svg" role="img">
      <defs>
        <radialGradient id={`ag-${uid}`} cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor={sk.a} />
          <stop offset="58%" stopColor={sk.b} />
          <stop offset="100%" stopColor={sk.c} />
        </radialGradient>
        <mask id={`am-${uid}`}>
          <rect x="0" y="0" width="120" height="132" fill="white" />
          {bites.map((b, i) => <circle key={i} cx={b[0]} cy={b[1]} r={b[2]} fill="black" />)}
        </mask>
      </defs>
      {Stem}
      {/* 속살(크림) → 파낸 자리에서 드러남 */}
      <path d={APPLE_BODY} fill={APPLE_FLESH} />
      {/* 껍질 → 베어 문 부분을 마스크로 제거 */}
      <path d={APPLE_BODY} fill={`url(#ag-${uid})`} mask={`url(#am-${uid})`} />
      {/* 하이라이트 */}
      <ellipse cx="45" cy="53" rx="10" ry="7" fill="#fff" opacity="0.38" mask={`url(#am-${uid})`} />
      {/* 많이 베어 물면 씨앗 살짝 */}
      {bite === 'b3' && <ellipse cx="74" cy="60" rx="2.6" ry="4.2" fill="#5A3A22" transform="rotate(18 74 60)" />}
    </svg>
  )
}

/* ── 🍎 사과 한 알 = 구독 하나 (누르면 상세가 열려요) ── */
function AppleItem({ item, onOpen }) {
  const { sub, urgency, snoozed } = item
  const svc = sub.serviceId ? SERVICE_MAP[sub.serviceId] : null
  const isTrial = sub.trialEnd && dday(sub.trialEnd) !== null && dday(sub.trialEnd) >= 0
  const face = snoozed ? '😴'
    : urgency.level === 'poison' ? '😱'
      : urgency.level === 'red' ? '🚨'
        : urgency.level === 'yellow' ? '🥺'
          : isTrial ? '🫣' : '😊'
  const bite = snoozed ? 'whole' : biteStage(urgency.dday)
  const payDate = urgency.target ? formatShortDate(urgency.target) : null

  const title = `${sub.name} · ${URGENCY[urgency.level].label}`
    + (payDate ? ` · ${formatKDate(urgency.target)} 결제` : '')
    + (svc ? ` · 해지 ${DIFFICULTY_LABEL[svc.difficulty].label} ${DIFFICULTY_LABEL[svc.difficulty].emoji}` : '')

  return (
    <button
      className={`apple ${snoozed ? 'snoozed' : ''} ${urgency.level === 'poison' || urgency.level === 'red' ? 'urgent' : ''}`}
      onClick={() => onOpen(sub.id)}
      title={title}
    >
      <div className={`apple-illustration ${urgency.level} bite-${bite}`}>
        {/* 빨간 사과가 결제일이 가까울수록 더 베어 먹힘 · '오늘 결제'(core)만 검정 독사과 */}
        <AppleSvg level={bite === 'core' ? 'poison' : 'red'} bite={bite} />
        {bite !== 'core' && <span className="apple-face">{face}</span>}
        {/* 시안: D-day와 결제일을 한 배지에 합침 */}
        <span className="apple-dday">
          {formatDday(urgency.dday)}
          {payDate && <em className="dd-date">📅 {payDate}</em>}
        </span>
      </div>
      {isTrial && <span className="apple-trial">🥺 체험</span>}
      <div className="apple-info">
        <span className="apple-name">{sub.name}</span>
        <span className="apple-price">{formatMoney(sub.amount, sub.currency)}</span>
      </div>
    </button>
  )
}

/* ── 🐛 농장 마스코트 애벌레 ── */
function Caterpillar({ sum, queue }) {
  const poison = queue.filter((i) => !i.snoozed && i.urgency.level === 'poison').length
  const red = queue.filter((i) => !i.snoozed && i.urgency.level === 'red').length

  const mood = poison > 0
    ? { face: '😱', say: `🖤 독사과가 ${poison}알 생겼어요!`, sub: '오늘 바로 결제돼요. 지금 처리해 주세요 🚨' }
    : red > 0
      ? { face: '🚨', say: `🍎 사과 ${red}알이 곧 익어요!`, sub: '1~2일 안에 결제될 예정이에요. 미리 골라낼까요?' }
      : sum.trialCount > 0
        ? { face: '🥺', say: `무료체험이 곧 끝나요...`, sub: `체험 중인 사과 ${sum.trialCount}알이 정가로 바뀌기 전이에요` }
        : sum.criticalCount > 0
          ? { face: '🫣', say: `🟡 슬슬 살펴볼 사과가 있어요`, sub: `${sum.criticalCount}알이 이번 주에 결제될 예정이에요` }
          : sum.activeCount >= 12
            ? { face: '😋', say: '사과가 많아서 배불러요!', sub: `바구니에 ${sum.activeCount}알이나 있어요. 조금 덜어볼까요?` }
            : { face: '😊', say: '오늘은 사과가 모두 건강해요!', sub: '정말 깨끗하네요! 이대로만 유지해요 ✨' }

  return (
    <div className="bug">
      <div className="bug-body">
        {/* 가이드 포인트 그린: 딥그린(#3E8C5A) → 라이트그린(#6EE07A) 그라데이션 */}
        <div className="bug-head" style={{ background: 'radial-gradient(circle at 34% 30%, #7BE38A, #3E8C5A)' }}>
          {mood.face}
        </div>
        <div className="bug-seg" style={{ background: 'radial-gradient(circle at 34% 30%, #83E692, #479A63)' }} />
        <div className="bug-seg" style={{ background: 'radial-gradient(circle at 34% 30%, #8FEA9C, #51A96D)' }} />
        <div className="bug-seg" style={{ background: 'radial-gradient(circle at 34% 30%, #9BEDA7, #5BB877)' }} />
        <div className="bug-seg" style={{ background: 'radial-gradient(circle at 34% 30%, #A7F0B2, #65C781)' }} />
      </div>
      <div className="bug-bubble">
        <div className="bug-say">{mood.say}</div>
        <div className="bug-sub">{mood.sub}</div>
      </div>
    </div>
  )
}

function Stat({ tone = '', emoji, label, value, sub }) {
  return (
    <div className={`card stat ${tone}`}>
      <div className="stat-label"><span className="emoji">{emoji}</span>{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard({ subs, settings, sum, queue, onOpen, setView, notify }) {
  const [filter, setFilter] = useState('todo')
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: '', loading: true })
  const series = useMemo(() => monthlySeries(subs, settings, 12), [subs, settings])
  const upcoming = useMemo(() => upcomingWithin(subs, settings, 30), [subs, settings])
  const lastAnalysis = useMemo(() => {
    const dates = subs
      .filter((s) => s.source === 'gmail' && s.createdAt)
      .map((s) => s.createdAt.slice(0, 10))
    return dates.length ? dates.sort().reverse()[0] : null
  }, [subs])

  useEffect(() => {
    let mounted = true
    getGmailToken().then(async (token) => {
      if (!mounted) return
      if (!token) { setGmailStatus({ connected: false, email: '', loading: false }); return }
      const profile = await getProfile(token)
      if (!mounted) return
      setGmailStatus({ connected: true, email: profile?.emailAddress || '', loading: false })
    })
    return () => { mounted = false }
  }, [])

  const visible = useMemo(() => {
    if (filter === 'todo') return queue.filter((i) => !i.snoozed && i.urgency.level !== 'none')
    if (filter === 'critical') return queue.filter((i) => i.urgency.critical && !i.snoozed)
    if (filter === 'trial') return queue.filter((i) => i.sub.trialEnd && dday(i.sub.trialEnd) >= 0)
    if (filter === 'cancelling') return queue.filter((i) => i.sub.status === STATUS.CANCELLING)
    if (filter === 'snoozed') return queue.filter((i) => i.snoozed)
    return queue
  }, [queue, filter])

  /* 브라우저 알림 (로컬 Notification API — 외부 전송 없음) */
  useEffect(() => {
    if (!settings.browserNotify) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const key = 'subclean.notified.' + new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(key)) return
    const urgent = queue.filter((i) => i.urgency.critical && !i.snoozed)
    if (!urgent.length) return
    localStorage.setItem(key, '1')
    new Notification('🍎 SubClean · 오늘 골라낼 사과', {
      body: `${urgent.length}알이 ${settings.alertDays}일 안에 결제돼요!\n${urgent.slice(0, 3).map((i) => i.sub.name).join(', ')}`,
    })
  }, [queue, settings])

  const filters = [
    { id: 'todo', label: `🧺 바구니 전체 ${queue.filter((i) => !i.snoozed && i.urgency.level !== 'none').length}` },
    { id: 'critical', label: `🚨 곧 결제 ${sum.criticalCount}` },
    { id: 'trial', label: `🥺 무료체험 ${sum.trialCount}` },
    { id: 'cancelling', label: `🍃 골라내는 중 ${sum.cancellingCount}` },
    { id: 'snoozed', label: `😴 재우는 중 ${queue.filter((i) => i.snoozed).length}` },
  ]

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">🧺 오늘의 사과바구니</h1>
        <p className="page-desc">
          구독 하나가 사과 한 알이에요 🍎 &nbsp;썩기 전에 골라내면 그만큼 돈이 모여요!
          사과를 누르면 자세히 볼 수 있어요 ✨
        </p>
      </div>

      <div className="grid c4" style={{ marginBottom: 18 }}>
        <Stat
          tone={sum.criticalCount > 0 ? 'danger' : 'ok'}
          emoji="🍎"
          label="오늘 결제 위험"
          value={`${sum.criticalCount}알`}
          sub={sum.criticalCount > 0 ? '지금 안 골라내면 결제돼요 🚨' : '급한 사과가 없어요 😊'}
        />
        <Stat
          emoji="🍃"
          label="이번 달 예상 구독료"
          value={formatKRW(sum.monthly)}
          sub={`바구니 ${sum.activeCount}알 중인 구독`}
        />
        <Stat
          emoji="🍏"
          label="연간 예상 구독료"
          value={formatKRW(sum.yearly)}
          sub={`매달 평균 ${formatKRW(Math.round(sum.monthly / (sum.activeCount || 1)))} · 구독 ${sum.activeCount}알`}
        />
        <Stat
          tone="warn"
          emoji="🥺"
          label="무료 체험 중"
          value={`${sum.trialCount}알`}
          sub="끝나면 바로 정가로 바뀌어요"
        />
      </div>

      {gmailStatus.loading ? null : gmailStatus.connected ? (
        <div className="gmail-status connected">
          <span className="gmail-ico">✓</span>
          <span className="gmail-txt">
            <b>Gmail 연결됨</b>
            {gmailStatus.email ? ` · ${gmailStatus.email}` : ''}
          </span>
          <span className="gmail-last">📩 Gmail에서 확인된 구독 데이터를 사용 중이에요{lastAnalysis ? ` · 마지막 분석 ${lastAnalysis.replace(/-/g, '.')}` : ''}</span>
        </div>
      ) : (
        <div className="gmail-status">
          <span className="gmail-ico">🔌</span>
          <span className="gmail-txt">Gmail 미연결</span>
          <button className="btn sm leaf" onClick={() => setView('inbox')}>📧 연결하기</button>
        </div>
      )}

      {/* 시안: 2단 → 1단. 바구니가 전체 폭을 쓰고 분석 배너 3종은 그 아래로 */}
      <div style={{ marginBottom: 18 }}>
        <div>
          <div className="tabs dashboard-tabs" aria-label="사과바구니 필터">
            {filters.map((f, i) => (
              <button
                key={f.id}
                className={`tab leaf-${i} ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="basket">
            <div className="basket-handle" />
            <div className="basket-tag">🧺 오늘의 사과바구니 · {visible.length}알</div>

            {visible.length === 0 ? (
              <div className="empty" style={{ border: 'none', background: 'transparent', marginTop: 20 }}>
                <div className="big">🍎</div>
                오늘은 사과가 모두 건강해요!
                <div style={{ fontWeight: 700, color: 'var(--text-3)', marginTop: 6 }}>
                  😊 정말 깨끗하네요!
                </div>
                <button className="btn leaf" style={{ marginTop: 16 }} onClick={() => setView('inbox')}>
                  📧 메일함 연결하고 사과 찾기
                </button>
              </div>
            ) : (
              <div className="apple-grid">
                {visible.map((item) => (
                  <AppleItem key={item.sub.id} item={item} onOpen={onOpen} />
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-title">🍎 사과가 알려주는 것 <span className="hint">결제일이 가까울수록 더 베어 먹혀요</span></div>
            <div className="legend">
              <span>🍎 <b>온전한 사과</b> — 여유 있어요 (2주 이상)</span>
              <span>🍏 <b>한 입</b> — 슬슬 살펴봐요 (2주 내)</span>
              <span>🍎 <b>두 입</b> — 이번 주 결제 예정</span>
              <span>🍎 <b>크게 베어 문</b> — 1~2일 뒤 결제!</span>
              <span>🧎 <b>사과 심만</b> — 오늘 결제, 즉시 처리</span>
              <span>😴 <b>잠든 사과</b> — 잠시 보류 중</span>
            </div>
          </div>

        </div>

        <div className="grid c3" style={{ marginTop: 18, alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">📅 결제 일정 <span className="hint">30일 내 예정</span></div>
            {upcoming.length === 0 ? (
              <div className="empty" style={{ border: 'none', background: 'transparent', padding: 24 }}>
                <div className="big">🍏</div>
                30일 안에 결제 예정이 없어요
              </div>
            ) : (
              <div className="schedule">
                {upcoming.slice(0, 6).map((item) => {
                  const u = urgencyOf(item, settings)
                  return (
                    <button key={item.id} className={`schedule-row ${u.level}`} onClick={() => onOpen(item.id)}>
                      <span className="sch-dday">{formatDday(u.dday)}</span>
                      <span className="sch-name">{item.name}</span>
                      <span className="sch-amount">{formatMoney(item.amount, item.currency)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">🍃 지출 vs 절약 <span className="hint">최근 12개월</span></div>
            <div className="chart-box sm">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF3B30" stopOpacity={0.42} />
                      <stop offset="100%" stopColor="#FF3B30" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#FFE9D8" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false} axisLine={false} width={44}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(v, n) => [formatKRW(v), n]}
                    contentStyle={{ background: '#fff', border: '3px solid #FFE9D8', borderRadius: 24, fontWeight: 800 }}
                  />
                  <Area
                    type="monotone" dataKey="spend" name="🍎 실제 지출"
                    stroke="#FF3B30" strokeWidth={3} fill="url(#gSpend)"
                  />
                  <Line
                    type="monotone" dataKey="saved" name="🍏 절약"
                    stroke="#67C23A" strokeWidth={3} dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="legend" style={{ marginTop: 10 }}>
              <span><i className="dot" style={{ background: '#FF3B30' }} /> 🍎 실제 지출</span>
              <span><i className="dot" style={{ background: '#67C23A' }} /> 🍏 골라내서 아낀 금액</span>
            </div>
            <button className="btn sm" style={{ marginTop: 14 }} onClick={() => setView('analytics')}>
              🍃 절약 분석 보러가기 →
            </button>
          </div>

          <div className="card">
            <div className="card-title">🌱 우리 농장 성장 기록</div>
            {[
              { st: STATUS.ACTIVE, emoji: '🍎', color: 'var(--apple)' },
              { st: STATUS.CANCELLING, emoji: '🍃', color: 'var(--yellow)' },
              { st: STATUS.KEPT, emoji: '😴', color: '#D8B48A' },
              { st: STATUS.CANCELLED, emoji: '🎉', color: 'var(--leaf)' },
            ].map(({ st, emoji, color }) => {
              const list = subs.filter((s) => s.status === st)
              const pct = subs.length ? (list.length / subs.length) * 100 : 0
              return (
                <div className="bar-row" key={st}>
                  <div>
                    <div style={{ marginBottom: 5 }}>{emoji} {STATUS_LABEL[st]}</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{list.length}알</div>
                </div>
              )
            })}
            <div className="tip" style={{ marginTop: 14 }}>
              <span>🍃</span>
              <span>
                해지는 "신청"만으로 끝나지 않아요! <b>확인 메일까지 받아야</b> 진짜 골라낸 거예요.
                사과를 눌러서 증빙을 기록해 두세요 ✨
              </span>
            </div>
          </div>
        </div>

        <Caterpillar sum={sum} queue={queue} />

        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-title">
            📅 캘린더 · 알림으로 받기
            <span className="hint">앱을 안 켜도 결제일에 알림이 와요</span>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button
              className="btn primary"
              onClick={() => {
                const n = downloadIcs(subs)
                notify(n ? `📅 일정 ${n}건을 .ics 파일로 저장했어요` : '등록할 결제일이 없어요')
              }}
            >
              📥 전체 결제일 캘린더로 내보내기
            </button>
            <button
              className="btn leaf"
              onClick={() => notifyDeadlines(subs, settings, { force: true }).then((r) => {
                if (r.ok) notify('🔔 지금 알림을 보냈어요')
                else notify(r.reason === 'denied' ? '🔕 알림 권한이 거부돼 있어요' : '🔕 이 브라우저는 알림을 지원하지 않아요')
              })}
            >
              🔔 지금 남은 기간 알림 받기
            </button>
          </div>
          <div className="tip" style={{ marginTop: 12 }}>
            <span>💡</span>
            <span>
              .ics 파일은 <b>calendar.google.com → 설정 → 가져오기/내보내기</b>에서 등록하면
              반복 일정과 3일 전·1일 전·당일 알림이 한 번에 걸립니다.
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
