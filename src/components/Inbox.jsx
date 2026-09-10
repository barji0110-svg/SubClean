import { useEffect, useMemo, useRef, useState } from 'react'

import { parseText } from '../lib/parser.js'
import { subscriptionFromParsed, findDuplicate, blankSubscription, syncSteps, STATUS } from '../lib/storage.js'
import { notifyDeadlines } from '../lib/gmailImport.js'
import { downloadIcs, googleCalendarUrl } from '../lib/calendar.js'
import { connectGmail, getGmailToken, searchEmails, getMessage, getHeader, extractPlainText, isGmailConnectPending } from '../lib/gmailApi.js'
import { getAllServices, getGmailQuery, getServiceMeta, classifyMessage, detectEventType, extractAmount, extractCurrency, extractDate, formatMessagePreview } from '../services/emailDetectionService.js'
import { formatKDate, formatMoney, formatDday, dday, CYCLE_LABEL } from '../lib/dates.js'

/* ── 연동 가능한 메일 서비스 ── */
const PROVIDERS = [
  { id: 'gmail', icon: '📧', name: 'Gmail 연결하기', sub: 'Google OAuth · Gmail 읽기 전용 접근', primary: true, real: true },
  { id: 'naver', icon: '📮', name: '네이버 메일 연결', sub: '아직 연동되지 않았어요', disabled: true },
  { id: 'outlook', icon: '📨', name: 'Outlook 연결', sub: '아직 연동되지 않았어요', disabled: true },
  { id: 'icloud', icon: '☁️', name: 'iCloud Mail 연결', sub: '아직 연동되지 않았어요', disabled: true },
]

const PROVIDER_LABEL = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.name.replace(/ (연결하기|연결)$/, '')]))

/* ── 분석 중 애벌레가 들려주는 이야기 ── */
const LOADING_LINES = [
  { emoji: '🌱', text: '🐛 애벌레가 메일함에서 사과를 찾고 있어요...' },
  { emoji: '🌿', text: '🍃 잎사귀를 하나씩 살펴보고 있어요...' },
  { emoji: '🌿', text: '🧐 영수증이랑 결제 예정일을 읽는 중이에요...' },
  { emoji: '🍏', text: '🍎 사과를 심는 중...' },
  { emoji: '🍎', text: '🧺 바구니에 차곡차곡 담고 있어요...' },
]

function riskLevel(d) {
  if (d === null || d === undefined) return 'none'
  if (d <= 0) return 'poison'
  if (d <= 2) return 'red'
  if (d <= 7) return 'yellow'
  return 'green'
}
const RISK_FACE = { poison: '😱', red: '🚨', yellow: '🥺', green: '😊', none: '🍃' }

/* ── 수확한 사과 한 알 ── */
function HarvestApple({ sub, index, onOpen }) {
  const d = sub.trialEnd && dday(sub.trialEnd) >= 0 ? dday(sub.trialEnd) : dday(sub.nextBilling)
  const level = riskLevel(d)
  return (
    <button
      className="apple drop-in"
      style={{ animationDelay: `${Math.min(index * 0.085, 1.6)}s` }}
      onClick={() => onOpen(sub.id)}
      title={`${sub.name} · 눌러서 자세히 보기`}
    >
      <div className={`apple-body ${level}`}>
        {RISK_FACE[level]}
        <span className="apple-dday">{formatDday(d)}</span>
      </div>
      <div className="apple-name">{sub.name}</div>
      <div className="apple-price">{formatMoney(sub.amount, sub.currency)}</div>
    </button>
  )
}

/* ── 붙여넣기(고급) — 기존 텍스트 분석 로직 그대로 유지 ── */
function ManualPanel({ subs, addSubscriptions, notify, onDone }) {
  const [raw, setRaw] = useState('')
  const [results, setResults] = useState(null)
  const [picked, setPicked] = useState({})

  const run = (text) => {
    const src = text ?? raw
    if (!src.trim()) { notify('🥺 붙여넣은 내용이 없어요'); return }
    const parsed = parseText(src)
    setResults(parsed)
    const init = {}
    parsed.forEach((p, i) => { init[i] = p.confidence >= 0.5 })
    setPicked(init)
  }

  const dupInfo = useMemo(() => {
    if (!results) return {}
    const map = {}
    results.forEach((p, i) => {
      const d = findDuplicate(subs, { serviceId: p.serviceId, name: p.name })
      if (d) map[i] = d
    })
    return map
  }, [results, subs])

  const register = () => {
    const chosen = (results || []).filter((_, i) => picked[i])
    if (!chosen.length) { notify('🍎 담을 사과를 골라 주세요'); return }
    addSubscriptions(chosen.map(subscriptionFromParsed))
    setResults(null); setRaw('')
    onDone?.()
  }

  const pickedCount = Object.values(picked).filter(Boolean).length

  return (
    <div className="grid c2" style={{ alignItems: 'start', marginTop: 18 }}>
      <div className="card">
        <div className="card-title">💌 메시지 붙여넣기 <span className="hint">여러 통은 --- 로 구분</span></div>
        <textarea
          className="textarea"
          style={{ minHeight: 220 }}
          placeholder={'예)\n[Web발신]\n[티빙] 이용권 정기결제 안내\n다음 결제일 2026년 8월 3일에 17,000원이 결제될 예정입니다.'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => run()}>🔍 사과 찾기</button>
          <button className="btn ghost" onClick={() => { setRaw(''); setResults(null) }}>🧹 지우기</button>
        </div>
        <div className="tip" style={{ marginTop: 14 }}>
          <span>🔒</span>
          <span>붙여넣은 내용은 이 브라우저 안에서만 분석되며, 등록을 눌러야 바구니에 담깁니다.</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          🍎 찾아낸 사과
          {results && <span className="hint">{results.length}알 중 {pickedCount}알 선택됨</span>}
        </div>

        {!results && (
          <div className="empty">
            <div className="big">🌱</div>
            왼쪽에 메일이나 문자를 붙여넣고<br />[🔍 사과 찾기]를 눌러 주세요!
          </div>
        )}

        {results && results.length === 0 && (
          <div className="empty">
            <div className="big">🥺</div>
            앗, 사과를 찾지 못했어요...
          </div>
        )}

        {results && results.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
              {results.map((p, i) => {
                const dup = dupInfo[i]
                const target = p.trialEnd || p.nextBilling
                const lv = target ? riskLevel(dday(target)) : 'none'
                return (
                  <label key={i} className={`parsed ${dup ? 'dup' : ''}`} style={{ cursor: 'pointer' }}>
                    <div className="parsed-head">
                      <input
                        type="checkbox"
                        checked={!!picked[i]}
                        onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })}
                      />
                      <b style={{ fontSize: 14 }}>{p.name}</b>
                      <span className="pill mute">{p.messageLabel}</span>
                      {target && <span className={`pill ${lv}`}>{formatDday(dday(target))}</span>}
                      {dup && <span className="pill warn">🧺 이미 바구니에 있어요</span>}
                    </div>
                    <div className="parsed-grid">
                      <div><div className="pf-label">💰 금액</div><div className="pf-value">{p.amount != null ? formatMoney(p.amount, p.currency) : '—'}</div></div>
                      <div><div className="pf-label">🔁 주기</div><div className="pf-value">{CYCLE_LABEL[p.cycle]}</div></div>
                      <div><div className="pf-label">📅 다음 결제일</div><div className="pf-value">{p.nextBilling ? formatKDate(p.nextBilling) : '—'}</div></div>
                      <div><div className="pf-label">🥺 무료체험 만료</div><div className="pf-value">{p.trialEnd ? formatKDate(p.trialEnd) : '—'}</div></div>
                    </div>
                    {p.warnings.map((w) => (
                      <div className="warn-line" key={w}><span>!</span><span>{w}</span></div>
                    ))}
                  </label>
                )
              })}
            </div>
            <button className="btn primary" style={{ marginTop: 14 }} onClick={register}>
              🧺 사과 {pickedCount}알 바구니에 담기
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   메인 — 📧 메일함에서 사과 찾기
   ══════════════════════════════════════════════════════ */
export default function Inbox({ subs, addSubscriptions, updateSub, setView, notify, onOpen }) {
  const [phase, setPhase] = useState('idle')      // idle | connecting | analyzing | done | oauth_redirect
  const [provider, setProvider] = useState(null)
  const [step, setStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [harvest, setHarvest] = useState([])
  const [skipped, setSkipped] = useState(0)
  const [refreshed, setRefreshed] = useState([])
  const [showManual, setShowManual] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const [analysisLog, setAnalysisLog] = useState([])
  const timers = useRef([])
  const cancelRef = useRef(false)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (isGmailConnectPending() || phase !== 'idle') return
    getGmailToken().then(t => {
      if (t) setGmailConnected(true)
    })
  }, [])

  const connect = async (p) => {
    if (p.id === 'gmail') {
      const token = await getGmailToken()
      if (!token) {
        setPhase('oauth_redirect')
        await connectGmail()
        return
      }
      setGmailConnected(true)
    }
    setProvider(p.id)
    setPhase('connecting')
    setStep(0)
    setProgress(0)
    cancelRef.current = false

    const t = (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }
    t(() => setPhase('analyzing'), 850)

    LOADING_LINES.forEach((_, i) => {
      t(() => {
        if (cancelRef.current) return
        setStep(i)
        setProgress(Math.round(((i + 1) / LOADING_LINES.length) * 100))
      }, 850 + i * 720)
    })

    runRealGmailAnalysis(t)
  }

  const runRealGmailAnalysis = async (schedule) => {
    const token = await getGmailToken()
    if (!token) {
      notify('📧 Gmail 연결이 필요합니다')
      setPhase('idle')
      return
    }

    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!profileRes.ok) throw new Error('GMAIL_AUTH_FAILED')
      const profile = await profileRes.json()
      setGmailEmail(profile.emailAddress || '')

      const log = []
      const found = []
      const services = getAllServices()
      let searched = 0

      for (const svc of services) {
        if (cancelRef.current) break
        const query = getGmailQuery(svc.key)
        if (!query) continue

        try {
          const messages = await searchEmails(token, query, 15)
          searched += messages.length
          log.push({ service: svc.name, found: messages.length })

          if (messages.length === 0) {
            found.push({
              serviceKey: svc.key,
              serviceId: svc.serviceId,
              name: svc.name,
              category: svc.category,
              confidence: 'unknown',
              evidence: 'Gmail에서 관련 메일을 찾을 수 없음',
              facts: [`"${query}" 검색 결과 0건`],
            })
            continue
          }

          const facts = []
          const candidates = []   // 메일 단위로 이벤트·금액·날짜를 함께 보관
          let latestEventType = 'unknown'
          // 실제 청구(결제) 근거로만 금액을 인정하는 이벤트
          const CHARGE_EVENTS = ['payment_completed', 'subscription_renewed']
          // 다음 결제일 근거로만 날짜를 인정하는 이벤트
          const UPCOMING_EVENTS = ['payment_scheduled', 'subscription_renewed', 'trial_ending']

          for (const msg of messages.slice(0, 8)) {
            if (cancelRef.current) break
            const detail = await getMessage(token, msg.id)
            const headers = detail.payload?.headers || []
            const subject = getHeader(headers, 'Subject')
            const date = getHeader(headers, 'Date')
            const from = getHeader(headers, 'From')
            const body = extractPlainText(detail.payload) || detail.snippet || ''

            const eventType = detectEventType(subject, body)
            if (eventType !== 'unknown') latestEventType = eventType
            // 금액·날짜는 "그 메일 하나" 안에서만 뽑아 서로 뒤섞이지 않게 한다
            const text = `${subject} ${body}`
            const amount = CHARGE_EVENTS.includes(eventType) ? extractAmount(text) : null
            const currency = amount !== null ? (extractCurrency(text) || 'KRW') : null
            const evDate = UPCOMING_EVENTS.includes(eventType) ? extractDate(`${text} ${date}`) : null
            candidates.push({ eventType, amount, currency, date: evDate })

            facts.push(`[${eventType}] ${subject} — ${date ? date.slice(0, 10) : ''}`)
          }

          // 최신순 메일 중 실제 청구 메일에서 금액을, 예정/갱신 메일에서 다음 결제일을 취한다
          const chargeHit = candidates.find((c) => c.amount !== null)
          const dateHit = candidates.find((c) => c.date)
          // 실제 구독/결제 관계를 보여주는 이벤트가 하나라도 있는지 (오탐 제거 기준)
          const SUBSCRIPTION_SIGNALS = ['payment_completed', 'payment_scheduled', 'subscription_renewed', 'trial_started', 'trial_ending', 'payment_failed']
          const hasSignal = candidates.some((c) => SUBSCRIPTION_SIGNALS.includes(c.eventType))

          found.push({
            serviceKey: svc.key,
            serviceId: svc.serviceId,
            name: svc.name,
            category: svc.category,
            hasSignal,
            amount: chargeHit ? chargeHit.amount : null,
            currency: chargeHit ? (chargeHit.currency || svc.currency || 'KRW') : null,
            nextBilling: dateHit ? dateHit.date : null,
            eventType: chargeHit ? chargeHit.eventType : latestEventType,
            confidence: chargeHit ? 'confirmed' : facts.length > 0 ? 'partial' : 'unknown',
            facts: facts.slice(0, 5),
            unknown: chargeHit ? [] : (facts.length > 0 ? ['결제 금액을 확정하지 못했습니다 — 영수증·결제완료 메일이 없습니다'] : []),
          })
        } catch (e) {
          if (e.message === 'GMAIL_AUTH_FAILED') throw e
          log.push({ service: svc.name, found: 0, error: e.message })
          found.push({
            serviceKey: svc.key,
            serviceId: svc.serviceId,
            name: svc.name,
            category: svc.category,
            confidence: 'unknown',
            evidence: `API 오류: ${e.message}`,
            facts: [],
          })
        }
      }

      setAnalysisLog(log)
      const fresh = []
      let dup = 0
      const updates = []

      for (const item of found) {
        if (!item.serviceId) continue
        // 실제 구독/결제 신호가 없는 서비스(메일 0건·마케팅 메일만 등)는 등록하지 않는다 — 오탐 방지
        if (!item.hasSignal) continue
        const existing = subs.find(s => s.serviceId === item.serviceId && s.status !== STATUS.CANCELLED)
        if (existing) {
          if (existing.source === 'seed' && item.confidence !== 'unknown') {
            updates.push(existing.id)
          } else {
            dup++
            continue
          }
        }
        const base = blankSubscription()
        fresh.push(syncSteps({
          ...base,
          serviceId: item.serviceId,
          name: item.name,
          category: item.category,
          amount: item.amount,
          currency: item.currency || 'KRW',
          nextBilling: item.nextBilling || null,
          source: 'gmail',
          confidence: item.confidence === 'confirmed' ? 0.99 : item.confidence === 'partial' ? 0.6 : 0.3,
          evidence: item.evidence || item.facts?.[0] || '',
          notes: [
            '📧 Gmail API 분석 결과',
            ...(item.facts || []).map(f => `· ${f}`),
            ...(item.unknown?.length ? ['', '❓ 직접 확인 필요', ...item.unknown.map(u => `· ${u}`)] : []),
          ].join('\n'),
        }))
      }

      setHarvest(fresh)
      setSkipped(dup)
      setRefreshed(updates)
      if (fresh.length) addSubscriptions(fresh)
      setPhase('done')

      notifyDeadlines([...subs, ...fresh], { alertDays: 7 }).then((res) => {
        if (cancelRef.current) return
        if (res.ok) notify(`📧 Gmail 분석 완료 · ${searched}건 스캔, ${fresh.length}개 찾음`)
        else if (res.reason === 'denied') notify('🔕 알림 권한이 꺼져 있어요')
      })
    } catch (e) {
      if (e.message === 'GMAIL_AUTH_FAILED') {
        setGmailConnected(false)
        notify('📧 Gmail 접근 권한이 만료되었습니다. 다시 연결해주세요')
        setPhase('idle')
      } else {
        notify(`📧 Gmail 분석 오류: ${e.message}`)
        setPhase('idle')
      }
    }
  }

  const reset = () => {
    cancelRef.current = true
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPhase('idle'); setProvider(null); setHarvest([]); setSkipped(0); setRefreshed([]); setStep(0); setProgress(0); setAnalysisLog([])
  }

  const busy = phase === 'connecting' || phase === 'analyzing'
  const line = LOADING_LINES[Math.min(step, LOADING_LINES.length - 1)]

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">🍎 메일함에서 사과 찾기</h1>
        <p className="page-desc">
          📧 메일함을 연결하면 SubClean이 구독 메일을 자동으로 찾아드립니다.<br />
          결제 예정 · 무료체험 · 영수증 · 정기결제 · 구독 갱신 메일을 분석해 자동으로 사과를 심어드려요 😊
        </p>
      </div>

      {/* ── 연동 완료 상태 바 ── */}
      {phase !== 'idle' && (
        <div className="link-status">
          <span>✅ {PROVIDER_LABEL[provider]} 연결 완료</span>
          <span className="sep">|</span>
          {busy
            ? <span>🍃 Gmail API 분석 중...</span>
            : <span>🎉 {gmailEmail || 'Gmail'} 분석 완료</span>}
          <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={reset}>
            🔌 연동 해제
          </button>
        </div>
      )}

      {/* ── OAuth 리디렉션 중 ── */}
      {phase === 'oauth_redirect' && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="grow-stage">
            <div className="grow-emoji">🌰</div>
            <div className="grow-soil" />
            <div className="grow-say">🚀 Google 로그인 페이지로 이동합니다...</div>
            <div className="grow-sub">
              Gmail 읽기 전용 접근 권한을 요청합니다.<br />
              브라우저가 자동으로 이동하지 않으면 Google 계정으로 로그인해주세요.
            </div>
          </div>
        </div>
      )}

      {/* ── ① 미연동: 메일함 연결 히어로 ── */}
      {phase === 'idle' && (
        <>
          <div className="mail-hero">
            <h2>📬 메일함에 숨어있는 구독 사과를 찾아드릴게요!</h2>
            <p>
              복사도, 붙여넣기도 필요 없어요. 버튼 한 번이면 애벌레가 메일함을 대신 뒤져
              결제 예정일과 무료체험 만료일까지 알아서 정리해 드립니다 🐛
            </p>

            <div className="provider-grid">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={`btn-provider ${p.primary ? 'primary' : ''}`}
                  onClick={() => connect(p)}
                  disabled={p.disabled}
                  title={p.disabled ? '이 메일 서비스는 아직 연동되지 않았습니다' : undefined}
                >
                  <span className="p-ico">{p.icon}</span>
                  <span>
                    {p.name}
                    <span className="p-sub">{p.sub}</span>
                  </span>
                  <span className="demo-tag">{p.real ? '실제 메일' : '준비 중'}</span>
                </button>
              ))}
            </div>

            <div className="security-note">
              <span>🔒</span>
              <span>
                SubClean은 구독 및 결제 관련 메일만 분석하며, 메일 내용은 외부 서버에 저장하지 않습니다.
                OAuth 2.0으로 Gmail 읽기 전용(readonly) 접근만 요청하며, 언제든 Google 계정 설정에서 해제할 수 있어요.
              </span>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="empty" style={{ border: 'none', background: 'transparent' }}>
              <div className="big">📭</div>
              아직 메일을 연결하지 않았어요.
              <div style={{ fontWeight: 700, color: 'var(--text-3)', marginTop: 6 }}>
                Gmail 또는 네이버 메일을 연결하면 구독 메일을 자동으로 찾아드립니다 😊
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── ② 분석 중: 씨앗 → 싹 → 사과 ── */}
      {busy && (
        <div className="card">
          <div className="grow-stage">
            <div className="grow-emoji" key={phase === 'connecting' ? 'seed' : line.emoji}>
              {phase === 'connecting' ? '🌰' : line.emoji}
            </div>
            <div className="grow-soil" />
            <div className="grow-say">
              {phase === 'connecting' ? '🚪 메일함 문을 두드리는 중...' : line.text}
            </div>
            <div className="grow-steps">
              <span className={step >= 0 ? 'on' : ''}>🌱</span>
              <span className={step >= 2 ? 'on' : ''}>🌿</span>
              <span className={step >= 3 ? 'on' : ''}>🍏</span>
              <span className={step >= 4 ? 'on' : ''}>🍎</span>
            </div>
            <div className="grow-track">
              <div className="grow-fill" style={{ width: `${phase === 'connecting' ? 6 : progress}%` }} />
            </div>
            <div className="grow-sub">
              Gmail API로 대상을 서비스별 이메일을 검색하고 있어요...
            </div>
          </div>
        </div>
      )}

      {/* ── ③ 수확 완료: 황토 바구니에 사과가 뚝뚝 ── */}
      {phase === 'done' && (
        <>
          <div className="result-banner">
            <div className="big-count">
              🍎 <b>{harvest.length}</b>개의 구독 사과를 찾았어요! 😊
            </div>
            <div style={{ color: 'var(--text-2)', fontWeight: 700, marginTop: 6 }}>
              바구니에 자동으로 담아뒀어요.
              {refreshed.length > 0 && ` ${refreshed.length}개 서비스 데이터를 갱신했어요 ♻️`}
              {skipped > 0 && ` 이미 있던 사과 ${skipped}알은 건너뛰었습니다 🍃`}
            </div>
          </div>

          {provider === 'gmail' && (
            <>
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="card-title">
                  📊 Gmail 분석 결과
                  <span className="hint">{gmailEmail || 'Gmail'} · 서비스별 검색 결과</span>
                </div>
                <div style={{ display: 'grid', gap: 9 }}>
                  {analysisLog.map((log) => (
                    <div key={log.service} className={`trap ${log.error ? '' : log.found > 0 ? 'background: var(--leaf-soft); border-color: #C8EDB4; color: var(--leaf-deep)' : ''}`}
                      style={log.error ? {} : log.found > 0 ? { background: 'var(--leaf-soft)', borderColor: '#C8EDB4', color: 'var(--leaf-deep)' } : {}}>
                      <span>{log.error ? '❌' : log.found > 0 ? '📧' : '🔍'}</span>
                      <span>
                        <b>{log.service}</b> — {log.error ? `오류: ${log.error}` : log.found > 0 ? `메일 ${log.found}건 발견` : '관련 메일 없음'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ marginBottom: 18 }}>
                <div className="card-title">🧐 확인이 필요한 서비스</div>
                <div style={{ display: 'grid', gap: 9 }}>
                  {harvest.length === 0 && (
                    <div className="empty" style={{ border: 'none' }}>
                      <div className="big">🍏</div>
                      Gmail에서 찾은 새로운 구독이 없어요
                    </div>
                  )}
                  {harvest.filter(s => s.confidence < 0.7).map((s) => (
                    <div key={s.id} className="trap">
                      <span>🤔</span>
                      <span>
                        <b>{s.name}</b> — 정보 확인 필요
                        <br /><span style={{ fontWeight: 600, opacity: 0.9 }}>{s.evidence || '메일에서 충분한 정보를 찾지 못했습니다'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="harvest">
            <div className="harvest-title">🧺 오늘 수확한 사과</div>
            <div className="harvest-sub">사과를 누르면 해지 방법과 결제 정보를 볼 수 있어요 ✨</div>

            {harvest.length === 0 ? (
              <div className="empty" style={{ border: 'none', background: 'transparent' }}>
                <div className="big">🍏</div>
                새로 찾은 사과가 없어요!
                <div style={{ fontWeight: 700, color: 'var(--text-3)', marginTop: 6 }}>
                  😊 이미 모든 구독이 바구니에 담겨 있네요
                </div>
              </div>
            ) : (
              <div className="harvest-grid">
                {harvest.map((sub, i) => (
                  <HarvestApple key={sub.id} sub={sub} index={i} onOpen={onOpen} />
                ))}
              </div>
            )}
          </div>

          {provider === 'gmail' && gmailConnected && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-title">📅 구글 캘린더로 알림 받기</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 700, marginBottom: 14, lineHeight: 1.7 }}>
                결제일을 캘린더에 등록하면 <b>앱을 켜지 않아도</b> 알림이 옵니다.
                <br />반복 일정 + <b>3일 전 · 1일 전 · 당일 오전 9시</b> 알림이 함께 걸려요 ⏰
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <button
                  className="btn primary"
                  onClick={() => {
                    const n = downloadIcs([...subs, ...harvest])
                    notify(`📅 일정 ${n}건을 .ics 파일로 저장했어요`)
                  }}
                >
                  📥 캘린더 파일(.ics) 내려받기
                </button>
                {harvest.filter((s) => s.nextBilling).map((s) => (
                  <a
                    key={s.id}
                    className="btn"
                    href={googleCalendarUrl(s)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    📆 {s.name} 바로 추가
                  </a>
                ))}
              </div>
              <div className="tip" style={{ marginTop: 14 }}>
                <span>💡</span>
                <span>
                  .ics 파일은 <b>calendar.google.com → 설정 → 가져오기/내보내기 → 가져오기</b>에서 한 번에 등록됩니다.
                  링크 버튼은 일정 하나씩 바로 추가할 때 편해요.
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => setView('dashboard')}>
              🧺 오늘의 사과바구니로 가기
            </button>
            <button className="btn" onClick={reset}>📧 다른 메일함도 연결하기</button>
          </div>
        </>
      )}

      {/* ── 고급: 직접 붙여넣기 (기존 텍스트 분석 로직 유지) ── */}
      <div className="advanced-toggle">
        <button className="btn sm ghost" onClick={() => setShowManual((v) => !v)}>
          {showManual ? '🙈 직접 붙여넣기 접기' : '🔧 메일 원문을 직접 붙여넣을래요'}
        </button>
      </div>
      {showManual && (
        <ManualPanel
          subs={subs}
          addSubscriptions={addSubscriptions}
          notify={notify}
          onDone={() => setView('dashboard')}
        />
      )}
    </>
  )
}
