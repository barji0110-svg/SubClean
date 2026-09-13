import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'
import Inbox from './components/Inbox.jsx'
import Subscriptions from './components/Subscriptions.jsx'
import Analytics from './components/Analytics.jsx'
import Settings from './components/Settings.jsx'
import SubscriptionDrawer from './components/SubscriptionDrawer.jsx'
import Auth from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'

import { useAuth } from './lib/auth.jsx'
import {
  loadState, saveState, emptyState, STATUS, logActivity, syncSteps,
} from './lib/storage.js'
import { summary, actionQueue } from './lib/analytics.js'
import { todayIso, addCycle } from './lib/dates.js'
import { mergeOnLogin, pushChanges, fingerprint, isSyncable } from './lib/subsSync.js'
import { isGmailConnectPending, handleGmailCallback, clearGmailConnectPending } from './lib/gmailApi.js'
import { listenForResubscribe } from './lib/push.js'

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

  /**
   * 마지막으로 원격에 반영된 구독 스냅샷 (id → 지문).
   * 아래 write-behind 효과가 이걸 현재 상태와 비교해 변경분만 밀어 올린다.
   */
  const syncedRef = useRef(null)

  /**
   * 병합을 마친 계정 id.
   * `dbReady`(state) 대신 ref 로 두는 이유: setState 는 비동기라 계정을 전환하면
   * 다음 렌더 전까지 옛 값이 남아, 이전 계정 기준으로 write-behind 가 한 번 돌 수 있다.
   * ref 는 동기적으로 바뀌므로 그 틈이 없다.
   */
  const syncedUserRef = useRef(null)

  /**
   * 브라우저가 푸시 구독을 교체하면(만료·키 회전) 서비스워커가 재구독한 뒤
   * 앱에 알린다. 여기서 서버에 반영하지 않으면 그 기기는 아무 신호 없이 알림이 끊긴다.
   */
  useEffect(() => listenForResubscribe(() => user?.id), [user])

  /* 로그아웃하면 동기화 상태를 비운다 (다음 로그인 때 다시 병합하도록) */
  useEffect(() => {
    if (user) return
    syncedUserRef.current = null
    syncedRef.current = null
    setDbReady(false)
  }, [user])

  /* 로그인 직후 1회: 원격 ↔ 로컬 병합 */
  useEffect(() => {
    if (!configured || !user) return
    if (syncedUserRef.current === user.id) return

    // 재진입 차단과 동시에, 병합이 끝날 때까지 write-behind 를 막는다
    syncedUserRef.current = user.id
    syncedRef.current = null
    let cancelled = false

    const sync = async () => {
      try {
        const { merged, pulled, pushed } = await mergeOnLogin(user.id, state.subscriptions)
        if (cancelled) return

        // 원격에 올리지 않는 항목(데모 시드)은 로컬에만 남겨 둔다
        const localOnly = state.subscriptions.filter((s) => !isSyncable(s))
        const next = [...merged, ...localOnly]

        setState((prev) => ({ ...prev, subscriptions: next }))
        syncedRef.current = new Map(merged.map((s) => [s.id, fingerprint(s)]))

        if (pushed > 0) {
          setToast(`☁️ 구독 ${pushed}건을 클라우드에 올렸어요 (불러온 것 ${pulled}건)`)
        }
      } catch (e) {
        if (cancelled) return
        // 조용히 넘어가면 사용자는 클라우드에 저장된 줄 안다. 반드시 알린다.
        console.error('DB sync failed, using localStorage:', e)
        setToast(`⚠️ 클라우드 동기화 실패 — 이 기기에만 저장됩니다 (${e.message})`)
        // 원격 상태를 모르는 채로 밀어 올리면 덮어쓰기 사고가 난다.
        // syncedRef 를 null 로 둬서 write-behind 를 막고, 다음 기회에 다시 병합하게 한다.
        syncedUserRef.current = null
      }
      if (!cancelled) setDbReady(true)
    }

    sync()
    return () => { cancelled = true }
  }, [user, configured])

  /**
   * write-behind 동기화.
   *
   * 구독 목록이 바뀌면 원격과 비교해 변경분만 upsert / delete 한다.
   * 개별 mutation(추가·수정·삭제·스누즈·체크리스트)마다 저장 코드를 넣지 않아도
   * 여기 한 곳에서 전부 반영된다. 연속 편집을 묶으려고 0.8초 디바운스를 둔다.
   */
  useEffect(() => {
    if (!configured || !user || !dbReady || !syncedRef.current) return

    const timer = setTimeout(async () => {
      const prev = syncedRef.current
      const current = state.subscriptions.filter(isSyncable)

      const upserts = current.filter((s) => prev.get(s.id) !== fingerprint(s))
      const currentIds = new Set(current.map((s) => s.id))
      const deleteIds = [...prev.keys()].filter((id) => !currentIds.has(id))
      if (!upserts.length && !deleteIds.length) return

      try {
        await pushChanges(user.id, upserts, deleteIds)
        syncedRef.current = new Map(current.map((s) => [s.id, fingerprint(s)]))
      } catch (e) {
        console.error('구독 저장 실패:', e)
        setToast(`⚠️ 클라우드 저장 실패 — 이 기기에만 반영됐어요 (${e.message})`)
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [state.subscriptions, configured, user, dbReady])

  /* Gmail OAuth callback detection */
  useEffect(() => {
    if (!configured || !user) return
    if (!isGmailConnectPending()) return
    const process = async () => {
      const result = await handleGmailCallback()
      if (result?.error) {
        notify(`📧 Gmail 연결 실패: ${result.error}`)
      } else if (result?.token) {
        notify(result.warning
          ? `📧 Gmail 연결됨 (${result.email}) — ⚠️ ${result.warning}`
          : `📧 Gmail 연결 완료: ${result.email}`)
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

  /**
   * 지난 결제일을 오늘 이후로 굴린다.
   *
   * 마운트 시 한 번만 돌면 **클라우드에서 불러온 구독은 처리되지 않는다**
   * (원격 데이터가 도착하는 건 마운트 이후다). 그래서 목록이 바뀔 때마다 검사한다.
   * 한 번 굴리면 `nextBilling >= 오늘`이 되어 다음 실행에서 `changed` 가 false 이므로
   * 재귀 호출로 이어지지 않는다.
   */
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
  }, [state.subscriptions])

  const setSettings = useCallback((patch) => {
    mutate((p) => ({ ...p, settings: { ...p.settings, ...patch } }))
  }, [mutate])

  const resetAll = useCallback(() => {
    setState(emptyState())
    setOpenId(null)
    // 로그인 상태면 write-behind 가 원격 행까지 지운다. 그걸 숨기지 않는다.
    notify(configured && user
      ? '모든 데이터를 삭제했습니다 (클라우드 포함)'
      : '모든 데이터를 삭제했습니다')
  }, [notify, configured, user])

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
        <InstallPrompt />
        {view === 'dashboard' && <Dashboard {...shared} />}
        {view === 'inbox' && <Inbox {...shared} />}
        {view === 'subs' && <Subscriptions {...shared} />}
        {view === 'analytics' && <Analytics {...shared} />}
        {view === 'settings' && (
          <Settings
            {...shared}
            setSettings={setSettings}
            resetAll={resetAll}
            cloudSynced={Boolean(configured && user)}
            user={user}
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
