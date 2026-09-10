import { useMemo, useState } from 'react'

import { STATUS, STATUS_LABEL, blankSubscription, syncSteps } from '../lib/storage.js'
import { SERVICES, SERVICE_MAP, CATEGORIES } from '../data/services.js'
import { urgencyOf } from '../lib/analytics.js'
import {
  formatMoney, formatDday, formatKRW, monthlyKRW, CYCLE_LABEL, todayIso,
} from '../lib/dates.js'

function AddForm({ onAdd, onClose }) {
  const [f, setF] = useState(() => ({ ...blankSubscription(), nextBilling: todayIso() }))
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const pickService = (id) => {
    if (!id) { set('serviceId', null); return }
    const s = SERVICE_MAP[id]
    setF((p) => ({
      ...p,
      serviceId: id, name: s.name, category: s.category,
      amount: s.defaultPrice, currency: s.currency, cycle: s.cycle,
    }))
  }

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return
    onAdd(syncSteps({ ...f, amount: Number(f.amount) || 0 }))
    onClose()
  }

  return (
    <form className="card" style={{ marginBottom: 14 }} onSubmit={submit}>
      <div className="card-title">🌱 사과 직접 심기</div>
      <div className="grid c3">
        <div className="field">
          <label>서비스 선택 (내장 사전)</label>
          <select className="select" value={f.serviceId || ''} onChange={(e) => pickService(e.target.value)}>
            <option value="">직접 입력</option>
            {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>서비스명</label>
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div className="field">
          <label>카테고리</label>
          <select className="select" value={f.category} onChange={(e) => set('category', e.target.value)}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>금액</label>
          <input className="input" type="number" step="0.01" value={f.amount ?? ''} onChange={(e) => set('amount', e.target.value)} />
        </div>
        <div className="field">
          <label>통화</label>
          <select className="select" value={f.currency} onChange={(e) => set('currency', e.target.value)}>
            <option value="KRW">KRW (원)</option>
            <option value="USD">USD (달러)</option>
          </select>
        </div>
        <div className="field">
          <label>결제 주기</label>
          <select className="select" value={f.cycle} onChange={(e) => set('cycle', e.target.value)}>
            {Object.entries(CYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>다음 결제일</label>
          <input className="input" type="date" value={f.nextBilling || ''} onChange={(e) => set('nextBilling', e.target.value)} />
        </div>
        <div className="field">
          <label>무료체험 만료일 (선택)</label>
          <input className="input" type="date" value={f.trialEnd || ''} onChange={(e) => set('trialEnd', e.target.value || null)} />
        </div>
        <div className="field">
          <label>마지막 사용일 (선택)</label>
          <input className="input" type="date" value={f.lastUsed || ''} onChange={(e) => set('lastUsed', e.target.value || null)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn primary" type="submit">🍎 바구니에 담기</button>
        <button className="btn ghost" type="button" onClick={onClose}>취소</button>
      </div>
    </form>
  )
}

export default function Subscriptions({ subs, settings, onOpen, addSubscriptions, setStatus }) {
  const [status, setStatusFilter] = useState('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    return subs
      .filter((s) => (status === 'all' ? true : s.status === status))
      .filter((s) => (q ? s.name.toLowerCase().includes(q.toLowerCase()) : true))
      .map((s) => ({ s, u: urgencyOf(s, settings) }))
      .sort((a, b) => {
        if (a.u.dday === null) return 1
        if (b.u.dday === null) return -1
        return a.u.dday - b.u.dday
      })
  }, [subs, status, q, settings])

  const totalMonthly = rows
    .filter((r) => r.s.status !== STATUS.CANCELLED)
    .reduce((a, r) => a + monthlyKRW(r.s, settings.usdRate), 0)

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">🍏 내 구독</h1>
        <p className="page-desc">농장에 심은 사과를 한눈에 볼 수 있어요 🍎 &nbsp;사과를 누르면 골라내기 안내가 열려요!</p>
      </div>

      {adding && <AddForm onAdd={(s) => addSubscriptions([s])} onClose={() => setAdding(false)} />}

      <div className="filter-bar">
        <input className="input" placeholder="🔍 사과 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={status} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">🧺 전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span style={{ color: 'var(--text-2)', fontSize: 12.5, fontWeight: 800 }}>
          🍎 {rows.length}알 · 월 합계 <b style={{ color: 'var(--apple)' }}>{formatKRW(totalMonthly)}</b>
        </span>
        <button className="btn primary sm" style={{ marginLeft: 'auto' }} onClick={() => setAdding((v) => !v)}>
          🌱 사과 직접 심기
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="big">🍏</div>
          조건에 맞는 사과가 없어요!
          <div style={{ fontWeight: 700, color: 'var(--text-3)', marginTop: 6 }}>😊 다른 조건으로 찾아볼까요?</div>
        </div>
      ) : (
        <div className="sub-grid">
          {rows.map(({ s, u }) => {
            const cat = CATEGORIES[s.category] ?? CATEGORIES.etc
            const done = (s.steps || []).filter(Boolean).length
            const total = s.steps?.length ?? 0
            const snoozed = s.status === STATUS.KEPT
            const isTrial = s.trialEnd && s.status !== STATUS.CANCELLED
            const face = snoozed ? '😴'
              : u.level === 'poison' ? '😱'
                : u.level === 'red' ? '🚨'
                  : u.level === 'yellow' ? '🥺'
                    : isTrial ? '🫣' : '😊'

            return (
              <button
                key={s.id}
                className={`apple ${u.level === 'poison' || u.level === 'red' ? 'urgent' : ''} ${snoozed ? 'snoozed' : ''}`}
                onClick={() => onOpen(s.id)}
                title={s.name}
              >
                <div className={`apple-body ${u.level}`}>
                  {face}
                  <span className="apple-dday">{u.dday === null ? '🍃' : formatDday(u.dday)}</span>
                </div>
                <div className="apple-name">
                  {s.name}
                  {isTrial && <span className="trial-tag">체험</span>}
                </div>
                <div className="apple-price">{formatMoney(s.amount, s.currency)}</div>
                <div className="apple-meta">
                  <span>{cat.emoji} {cat.label}</span>
                  {total > 0 && <span className="apple-progress">{done}/{total}</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
