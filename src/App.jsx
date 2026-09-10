import { useCallback, useEffect, useMemo, useState } from 'react'

import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'
import Inbox from './components/Inbox.jsx'
import Subscriptions from './components/Subscriptions.jsx'
import Analytics from './components/Analytics.jsx'
import Settings from './components/Settings.jsx'
import SubscriptionDrawer from './components/SubscriptionDrawer.jsx'
import Auth from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'

import { useAuth } from './lib/auth.jsx'
import {
  loadState, saveState, emptyState, STATUS, logActivity, syncSteps,
} from './lib/storage.js'
import { summary, actionQueue } from './lib/analytics.js'
import { todayIso, addCycle } from './lib/dates.js'
import { syncLocalToSupabase, getSubscriptions } from './lib/db.js'
import { isGmailConnectPending, handleGmailCallback, clearGmailConnectPending } from './lib/gmailApi.js'

function initialState() {
  return loadState() || emptyState()
}

export default function App() {
  const { user, loading: authLoading, configured } = useAuth()
  const [state, setState] = useState(initialState)
  const [view, setView] = useState('dashboard')
  const [openId, setOpenId] = useState(null)
  const [toast, setToast] = useState(null)
  const [onboardingDone, setOnboardingDone] = useState(() => {
    return localStorage.getItem('subclean.onboarding.done') === 'true' || !configured
  })
  const [dbReady, setDbReady] = useState(false)

  /* DB ↔ localStorage sync when user logs in */
  useEffect(() => {
    if (!configured || !user || dbReady) return
    const sync = async () => {
      try {
        const dbSubs = await getSubscriptions(user.id)
        if (dbSubs.length > 0) {
          const mapped = dbSubs.map((s) => ({
            id: s.id,
            serviceId: s.service_id,
            name: s.plan_name,
            category: 'etc',
            amount: s.price,
            currency: s.currency,
            cycle: s.billing_cycle,
            nextBilling: s.next_billing_date,
            trialEnd: s.trial_end_date,
            status: s.status,
            source: s.data_source,
            createdAt: s.created_at,
            steps: [],
            snoozeUntil: null,
            notes: '',
            evidence: '',
            cancelledAt: null,
            lastUsed: null,
            rawSnippet: '',
          }))
          setState((prev) => ({ ...prev, subscriptions: mapped }))
        } else if (state.subscriptions.length > 0) {
          const result = await syncLocalToSupabase(user.id, state.subscriptions)
          if (result.created > 0 || result.updated > 0) {
            setToast(`🍎 Supabase 동기 완료 (${result.created}개 생성, ${result.updated}개 갱신)`)
          }
        }
      } catch (e) {
        console.warn('DB sync failed, using localStorage:', e)
      }
      setDbReady(true)
    }
    sync()
  }, [user, configured])

  /* Gmail OAuth callback detection */
  useEffect(() => {
    if (!configured || !user) return
    if (!isGmailConnectPending()) return
    const process = async () => {
      const result = await handleGmailCallback()
      if (result?.error) {
        notify(`📧 Gmail 연결 실패: ${result.error}`)
      } else if (result?.token) {
        notify(`📧 Gmail 연결 완료: ${result.email}`)
        setView('inbox')
      } else {
        clearGmailConnectPending()
      }
    }
    process()
  }, [user, configured])

  /* 영속화 */
  useEffect(() => { saveState(state) }, [state])

  /* 테마 */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.settings.theme)
  }, [state.settings.theme])

  const notify = useCallback((message) => {
    setToast(message)
    window.clearTimeout(notify._t)
    notify._t = window.setTimeout(() => setToast(null), 2400)
  }, [])

  const mutate = useCallback((fn, logMsg, logType = 'info') => {
    setState((prev) => {
      const next = fn(prev)
      if (!next) return prev
      return logMsg
        ? { ...next, activity: logActivity(next.activity, logType, logMsg) }
        : next
    })
  }, [])

  const addSubscriptions = useCallback((subs) => {
    mutate(
      (p) => ({ ...p, subscriptions: [...p.subscriptions, ...subs.map(syncSteps)] }),
      `구독 ${subs.length}건 등록: ${subs.map((s) => s.name).join(', ')}`,
      'add',
    )
    notify(`${subs.length}건을 구독 목록에 등록했습니다`)
  }, [mutate, notify])

  const updateSub = useCallback((id, patch, logMsg) => {
    mutate(
      (p) => ({
        ...p,
        subscriptions: p.subscriptions.map((s) => (s.id === id ? syncSteps({ ...s, ...patch }) : s)),
      }),
      logMsg,
      'update',
    )
  }, [mutate])

  const removeSub = useCallback((id) => {
    const target = state.subscriptions.find((s) => s.id === id)
    mutate(
      (p) => ({ ...p, subscriptions: p.subscriptions.filter((s) => s.id !== id) }),
      target ? `${target.name} 삭제` : null,
      'delete',
    )
    setOpenId(null)
    notify('구독을 삭제했습니다')
  }, [mutate, notify, state.subscriptions])

  const setStatus = useCallback((id, status) => {
    const target = state.subscriptions.find((s) => s.id === id)
    const patch = { status }
    if (status === STATUS.CANCELLED) {
      patch.cancelledAt = todayIso()
      patch.snoozeUntil = null
    }
    if (status === STATUS.ACTIVE) patch.cancelledAt = null
    const label = {
      active: '구독 중으로 되돌림',
      cancelling: '해지 진행 시작',
      cancelled: '해지 완료 처리',
      kept: '유지 결정',
    }[status]
    updateSub(id, patch, target ? `${target.name} — ${label}` : null)
    notify(label)
  }, [state.subscriptions, updateSub, notify])

  const snooze = useCallback((id, days) => {
    const target = state.subscriptions.find((s) => s.id === id)
    const until = todayIso(new Date(Date.now() + days * 864e5))
    updateSub(id, { snoozeUntil: until, status: STATUS.KEPT },
      target ? `${target.name} — ${days}일 보류 (재검토 ${until})` : null)
    notify(`${days}일 뒤에 다시 알려드릴게요`)
  }, [state.subscriptions, updateSub, notify])

  const toggleStep = useCallback((id, index) => {
    setState((prev) => ({
      ...prev,
      subscriptions: prev.subscriptions.map((s) => {
        if (s.id !== id) return s
        const steps = [...(s.steps || [])]
        steps[index] = !steps[index]
        const anyDone = steps.some(Boolean)
        const status = anyDone && s.status === STATUS.ACTIVE ? STATUS.CANCELLING : s.status
        return { ...s, steps, status }
      }),
    }))
  }, [])

  useEffect(() => {
    const t = todayIso()
    let changed = false
    const next = state.subscriptions.map((s) => {
      if (s.status === STATUS.CANCELLED || !s.nextBilling) return s
      if (s.nextBilling >= t) return s
      changed = true
      let cur = s.nextBilling
      let guard = 0
      while (cur < t && guard < 400) { cur = addCycle(cur, s.cycle, 1); guard += 1 }
      return { ...s, lastPaid: s.nextBilling, nextBilling: cur, trialEnd: null }
    })
    if (changed) setState((p) => ({ ...p, subscriptions: next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setSettings = useCallback((patch) => {
    mutate((p) => ({ ...p, settings: { ...p.settings, ...patch } }))
  }, [mutate])

  const resetAll = useCallback(() => {
    setState(emptyState())
    setOpenId(null)
    notify('모든 데이터를 삭제했습니다')
  }, [notify])

  const purgeSeeded = useCallback(() => {
    setState((p) => {
      const removed = p.subscriptions.filter((s) => s.source === 'seed').length
      if (!removed) return p
      return {
        ...p,
        subscriptions: p.subscriptions.filter((s) => s.source !== 'seed'),
        activity: logActivity(p.activity, 'delete', `예시 구독 ${removed}건 삭제`),
      }
    })
    setOpenId(null)
  }, [])

  useEffect(() => { purgeSeeded() }, [purgeSeeded])

  const sum = useMemo(() => summary(state.subscriptions, state.settings), [state])
  const queue = useMemo(() => actionQueue(state.subscriptions, state.settings), [state])
  const openSub = useMemo(
    () => state.subscriptions.find((s) => s.id === openId) || null,
    [state.subscriptions, openId],
  )

  const shared = {
    state, settings: state.settings, subs: state.subscriptions,
    sum, queue, notify, onOpen: setOpenId,
    setStatus, snooze, updateSub, removeSub, addSubscriptions, setView,
  }

  const handleOnboardingDone = () => {
    localStorage.setItem('subclean.onboarding.done', 'true')
    setOnboardingDone(true)
  }

  /* Auth gate */
  if (configured && authLoading) {
    return <div className="auth-page"><div className="auth-card" style={{ textAlign: 'center' }}>🍎<br />로딩 중...</div></div>
  }

  if (configured && !user) {
    return <Auth notify={notify} />
  }

  /* Onboarding gate */
  if (configured && user && !onboardingDone) {
    return <Onboarding user={user} onDone={handleOnboardingDone} notify={notify} setView={setView} />
  }

  return (
    <div className="app">
      {configured && user && (
        <div className="db-banner">
          <span>☁️ Supabase 연결됨</span>
          <span className="sep">|</span>
          <span>{user.email}</span>
        </div>
      )}
      <Sidebar view={view} setView={setView} sum={sum} />
      <main className="main">
        {view === 'dashboard' && <Dashboard {...shared} />}
        {view === 'inbox' && <Inbox {...shared} />}
        {view === 'subs' && <Subscriptions {...shared} />}
        {view === 'analytics' && <Analytics {...shared} />}
        {view === 'settings' && (
          <Settings
            {...shared}
            setSettings={setSettings}
            resetAll={resetAll}
          />
        )}
      </main>

      {openSub && (
        <SubscriptionDrawer
          sub={openSub}
          settings={state.settings}
          onClose={() => setOpenId(null)}
          onToggleStep={toggleStep}
          onStatus={setStatus}
          onSnooze={snooze}
          onUpdate={updateSub}
          onRemove={removeSub}
          notify={notify}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
