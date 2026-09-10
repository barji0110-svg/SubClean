import { useMemo, useState } from 'react'

import { SERVICE_MAP, DIFFICULTY_LABEL, CATEGORIES } from '../data/services.js'
import { STATUS, STATUS_LABEL } from '../lib/storage.js'
import { TEMPLATE_KINDS, generateTemplate } from '../lib/cancelTemplates.js'
import { urgencyOf } from '../lib/analytics.js'
import { googleCalendarUrl, downloadIcs } from '../lib/calendar.js'
import {
  formatMoney, formatKDate, formatDday, formatKRW, monthlyKRW, yearlyKRW, CYCLE_LABEL,
} from '../lib/dates.js'

const PROFILE_KEY = 'subclean.profile.v1'

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {} } catch { return {} }
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
  return Promise.resolve()
}

export default function SubscriptionDrawer({
  sub, settings, onClose, onToggleStep, onStatus, onSnooze, onUpdate, onRemove, notify,
}) {
  const svc = sub.serviceId ? SERVICE_MAP[sub.serviceId] : null
  const u = urgencyOf(sub, settings)
  const [tmplKind, setTmplKind] = useState('email')
  const [profile, setProfile] = useState(loadProfile)
  const [notes, setNotes] = useState(sub.notes || '')
  const [evidence, setEvidence] = useState(sub.evidence || '')

  const steps = svc?.steps ?? []
  const done = (sub.steps || []).filter(Boolean).length
  const pct = steps.length ? (done / steps.length) * 100 : 0

  const template = useMemo(
    () => generateTemplate(tmplKind, sub, profile),
    [tmplKind, sub, profile],
  )

  const setProfileField = (k, v) => {
    const next = { ...profile, [k]: v }
    setProfile(next)
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
  }

  const cat = CATEGORIES[sub.category] ?? CATEGORIES.etc

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <h2 className="drawer-title">
              <span>{u.emoji || '🍎'}</span>{sub.name}
            </h2>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <span className="pill mute">
                <i className="dot" style={{ background: cat.color }} />{cat.emoji} {cat.label}
              </span>
              <span className={`pill ${
                sub.status === STATUS.CANCELLED ? 'ok'
                  : sub.status === STATUS.CANCELLING ? 'accent'
                    : sub.status === STATUS.KEPT ? 'warn' : 'mute'
              }`}>
                {{ active: '🍎', cancelling: '🍃', cancelled: '🎉', kept: '😴' }[sub.status]}
                {' '}{STATUS_LABEL[sub.status]}
              </span>
              {u.dday !== null && <span className={`pill ${u.level}`}>{u.emoji} {formatDday(u.dday)}</span>}
              {svc && (
                <span className="pill mute" title={DIFFICULTY_LABEL[svc.difficulty].desc}>
                  {DIFFICULTY_LABEL[svc.difficulty].emoji} 골라내기 {DIFFICULTY_LABEL[svc.difficulty].label}
                </span>
              )}
            </div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        {/* 요약 */}
        <div className="drawer-sec">
          <dl className="kv">
            <dt>💰 결제 금액</dt>
            <dd>{formatMoney(sub.amount, sub.currency)} / {CYCLE_LABEL[sub.cycle]}</dd>
            <dt>🍃 월 환산</dt>
            <dd>{formatKRW(monthlyKRW(sub, settings.usdRate))}</dd>
            <dt>😱 1년이면</dt>
            <dd style={{ color: 'var(--apple)' }}>{formatKRW(yearlyKRW(sub, settings.usdRate))}</dd>
            <dt>📅 다음 결제일</dt>
            <dd>{sub.status === STATUS.CANCELLED ? '🎉 골라냈어요!' : formatKDate(sub.nextBilling)}</dd>
            {sub.trialEnd && (<><dt>🥺 체험 만료일</dt><dd style={{ color: 'var(--yellow-deep)' }}>{formatKDate(sub.trialEnd)}</dd></>)}
            {svc && (<><dt>🚪 해지 경로</dt><dd style={{ fontWeight: 700 }}>{svc.cancelPath}</dd></>)}
          </dl>
        </div>

        {/* 상태 전환 */}
        <div className="drawer-sec">
          <h4>🍎 이 사과, 어떻게 할까요?</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sub.status !== STATUS.CANCELLING && sub.status !== STATUS.CANCELLED && (
              <button className="btn primary" onClick={() => onStatus(sub.id, STATUS.CANCELLING)}>🍃 골라내기 시작</button>
            )}
            {sub.status !== STATUS.CANCELLED && (
              <button className="btn danger" onClick={() => onStatus(sub.id, STATUS.CANCELLED)}>🎉 다 골라냈어요!</button>
            )}
            {sub.status === STATUS.CANCELLED && (
              <button className="btn" onClick={() => onStatus(sub.id, STATUS.ACTIVE)}>🍎 다시 바구니에 담기</button>
            )}
            <button className="btn" onClick={() => onSnooze(sub.id, 7)}>😴 7일 재우기</button>
            <button className="btn" onClick={() => onSnooze(sub.id, 30)}>😴 30일 재우기</button>
          </div>

          {(sub.nextBilling || sub.trialEnd) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {sub.nextBilling && (
                <a
                  className="btn sm"
                  href={googleCalendarUrl(sub)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  📆 구글 캘린더에 결제일 추가
                </a>
              )}
              {sub.trialEnd && (
                <a
                  className="btn sm"
                  href={googleCalendarUrl(sub, { isTrial: true })}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  📆 체험 만료일 추가
                </a>
              )}
              <button
                className="btn sm ghost"
                onClick={() => { downloadIcs([sub]); notify('📅 .ics 파일을 저장했어요') }}
              >
                📥 .ics 파일로
              </button>
            </div>
          )}
          {sub.snoozeUntil && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, fontWeight: 700 }}>
              😴 {sub.snoozeUntil} 까지 바구니에서 쿨쿨 자고 있어요.
            </div>
          )}
        </div>

        {/* 해지 체크리스트 */}
        <div className="drawer-sec">
          <h4>✅ 골라내기 체크리스트 {steps.length > 0 && `(${done}/${steps.length}) ${done === steps.length ? '🎉' : ''}`}</h4>
          {steps.length === 0 ? (
            <div className="empty" style={{ padding: 28 }}>
              <div className="big">🍃</div>
              아직 안내가 준비되지 않은 사과예요!
              <div style={{ fontWeight: 700, color: 'var(--text-3)', marginTop: 6 }}>
                아래 메모에 해지 방법을 적어두면 다음에 편해요 😊
              </div>
            </div>
          ) : (
            <>
              <div className="progress-bar" style={{ marginBottom: 12 }}>
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="steps">
                {steps.map((text, i) => (
                  <div
                    key={i}
                    className={`step ${sub.steps?.[i] ? 'done' : ''}`}
                    onClick={() => onToggleStep(sub.id, i)}
                  >
                    <div className="step-box">✓</div>
                    <div className="step-text"><span className="step-num">{i + 1}</span>{text}</div>
                  </div>
                ))}
              </div>
              {svc?.cancelUrl && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)', wordBreak: 'break-all', fontWeight: 700 }}>
                  🚪 해지 페이지: <a href={svc.cancelUrl} target="_blank" rel="noreferrer">{svc.cancelUrl}</a>
                </div>
              )}
            </>
          )}

          {svc?.traps?.length > 0 && (
            <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
              {svc.traps.map((t) => (
                <div className="trap" key={t}><span>🪤</span><span>{t}</span></div>
              ))}
            </div>
          )}
        </div>

        {/* 해지 요청 문구 */}
        <div className="drawer-sec">
          <h4>✍️ 해지 요청 문구 만들기</h4>
          <div className="grid c3" style={{ marginBottom: 10 }}>
            <div className="field">
              <label>가입 계정/이메일</label>
              <input className="input" value={profile.accountId || ''} onChange={(e) => setProfileField('accountId', e.target.value)} placeholder="me@example.com" />
            </div>
            <div className="field">
              <label>가입자 성함</label>
              <input className="input" value={profile.holderName || ''} onChange={(e) => setProfileField('holderName', e.target.value)} placeholder="홍길동" />
            </div>
            <div className="field">
              <label>연락처</label>
              <input className="input" value={profile.phone || ''} onChange={(e) => setProfileField('phone', e.target.value)} placeholder="010-0000-0000" />
            </div>
          </div>

          <div className="tabs">
            {TEMPLATE_KINDS.map((t) => (
              <button
                key={t.id}
                className={`tab ${tmplKind === t.id ? 'active' : ''}`}
                onClick={() => setTmplKind(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="tmpl-box">{template}</div>
          <button
            className="btn primary sm"
            style={{ marginTop: 10 }}
            onClick={() => copyText(template).then(() => notify('📋 문구를 복사했어요! 붙여넣기만 하면 끝 ✨'))}
          >
            📋 문구 복사하기
          </button>
        </div>

        {/* 메모 & 증빙 */}
        <div className="drawer-sec">
          <h4>📎 증빙 · 메모</h4>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>🧾 해지 확인 증빙 (접수번호 · 확인 메일 수신 여부 등)</label>
            <input
              className="input"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              onBlur={() => onUpdate(sub.id, { evidence })}
              placeholder="예) 해지 확인 메일 수신 / 상담 접수번호 A-88213"
            />
          </div>
          <div className="field">
            <label>📝 메모</label>
            <textarea
              className="textarea"
              style={{ minHeight: 90, fontFamily: 'inherit', fontSize: 13 }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => onUpdate(sub.id, { notes })}
            />
          </div>
        </div>

        {sub.rawSnippet && (
          <div className="drawer-sec">
            <h4>💌 이 사과를 찾은 메시지</h4>
            <div className="tmpl-box" style={{ maxHeight: 180 }}>{sub.rawSnippet}</div>
          </div>
        )}

        <div className="drawer-sec">
          <button className="btn danger sm" onClick={() => onRemove(sub.id)}>🗑️ 이 사과 버리기</button>
        </div>
      </aside>
    </>
  )
}
