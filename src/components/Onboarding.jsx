import { useState } from 'react'

const STEPS = [
  {
    emoji: '📧',
    title: '이메일에서 구독 서비스를 찾아볼까요?',
    desc: 'Gmail을 연결하면 구독 관련 메일을 자동으로 분석해드려요.',
    action: 'Gmail 연결하기',
  },
  {
    emoji: '🔍',
    title: '구독 서비스를 발견하고 있어요...',
    desc: '메일함에서 결제 정보와 무료 체험을 찾고 있어요.',
    action: null,
  },
  {
    emoji: '🎉',
    title: '서비스 연결 완료!',
    desc: '이제 대시보드에서 모든 구독을 한눈에 확인할 수 있어요.',
    action: '대시보드로 가기',
  },
]

export default function Onboarding({ onDone, user }) {
  const [step, setStep] = useState(0)
  const [connecting, setConnecting] = useState(false)

  const current = STEPS[step]

  const handleAction = () => {
    if (step === 0) {
      setConnecting(true)
      setTimeout(() => {
        setConnecting(false)
        setStep(2)
      }, 2000)
    } else if (step === 2) {
      onDone()
    }
  }

  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
      <div className="grow-stage">
        <div className="grow-emoji">
          {connecting ? '🔍' : current.emoji}
        </div>
        <div className="grow-soil" />
        <div className="grow-say">{connecting ? '메일함을 분석 중이에요...' : current.title}</div>
        <div className="grow-sub">{current.desc}</div>

        <div className="grow-track" style={{ marginTop: 16 }}>
          <div className="grow-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <div className="grow-steps">
          {STEPS.map((s, i) => (
            <span key={i} className={i <= step ? 'on' : ''}>{s.emoji}</span>
          ))}
        </div>

        {current.action && !connecting && (
          <button className="btn primary" style={{ marginTop: 16 }} onClick={handleAction}>
            {current.action}
          </button>
        )}

        {step < 2 && !connecting && (
          <button className="btn sm ghost" style={{ marginTop: 8 }}           onClick={onDone}>
            🍎 나중에 할게요
          </button>
        )}
      </div>
    </div>
  )
}