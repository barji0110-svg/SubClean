import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'

import { monthlySeries, categorySeries } from '../lib/analytics.js'
import { formatKRW } from '../lib/dates.js'

export default function Analytics({ subs, settings, sum }) {
  const series = useMemo(() => monthlySeries(subs, settings, 12), [subs, settings])
  const cats = useMemo(() => categorySeries(subs, settings), [subs, settings])
  const catMax = cats.length ? cats[0].value : 1

  const first = series[0]?.total ?? 0
  const last = series[series.length - 1]?.spend ?? 0
  const diff = last - (series[0]?.spend ?? 0)

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">🍃 절약 분석</h1>
        <p className="page-desc">골라낸 사과 덕분에 얼마나 아꼈는지 살펴봐요 ✨</p>
      </div>

      <div className="grid c4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <div className="stat-label"><span className="emoji">🍎</span>이번 달 지출</div>
          <div className="stat-value">{formatKRW(sum.monthly)}</div>
          <div className="stat-sub">바구니 속 사과 {sum.activeCount}알</div>
        </div>
        <div className="card stat danger">
          <div className="stat-label"><span className="emoji">😱</span>1년이면 이만큼</div>
          <div className="stat-value">{formatKRW(sum.yearly)}</div>
          <div className="stat-sub">지금 그대로 12개월 두면요...</div>
        </div>
        <div className="card stat ok">
          <div className="stat-label"><span className="emoji">🍏</span>매달 아끼는 중</div>
          <div className="stat-value">{formatKRW(sum.savedMonthly)}</div>
          <div className="stat-sub">1년이면 {formatKRW(sum.savedYearly)}이나 돼요 🎉</div>
        </div>
        <div className="card stat accent">
          <div className="stat-label"><span className="emoji">✨</span>지금까지 모은 돈</div>
          <div className="stat-value">{formatKRW(sum.savedSoFar)}</div>
          <div className="stat-sub">골라낸 순간부터 차곡차곡 💚</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          📊 월별 지출 &amp; 절약 이야기
          <span className="hint">
            점선은 사과를 안 골라냈다면 냈을 금액이에요 · 12개월 전 대비 {diff >= 0 ? '+' : ''}{formatKRW(diff)}
          </span>
        </div>
        <div className="chart-box" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="aSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF3B30" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="#FF3B30" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#FFE9D8" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={62} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(v, n) => [formatKRW(v), n]}
                contentStyle={{ background: '#fff', border: '3px solid #FFE9D8', borderRadius: 24, fontWeight: 800 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, fontWeight: 800 }} />
              <Area type="monotone" dataKey="spend" name="🍎 실제 지출" stroke="#FF3B30" strokeWidth={3} fill="url(#aSpend)" />
              <Bar dataKey="saved" name="🍏 절약한 금액" fill="#67C23A" barSize={18} radius={[9, 9, 0, 0]} />
              <Line type="monotone" dataKey="total" name="🥺 안 골라냈다면" stroke="#C6B49F" strokeWidth={2} strokeDasharray="6 5" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🧺 어떤 사과가 많을까요? <span className="hint">바구니에 있는 사과 기준</span></div>
        {cats.length === 0 ? (
          <div className="empty">
            <div className="big">🍏</div>
            바구니가 텅 비었어요!
            <div style={{ fontWeight: 700, color: 'var(--text-3)', marginTop: 6 }}>😊 정말 깨끗하네요!</div>
          </div>
        ) : (
          cats.map((c) => (
            <div className="bar-row" key={c.id}>
              <div>
                <div style={{ marginBottom: 5, display: 'flex', gap: 7, alignItems: 'center' }}>
                  <i className="dot" style={{ background: c.color }} />{c.emoji} {c.name}
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(c.value / catMax) * 100}%`, background: c.color }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatKRW(c.value)}</div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
