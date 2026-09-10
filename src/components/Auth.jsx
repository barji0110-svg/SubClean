import { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'

export default function Auth({ notify }) {
  const { configured, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!configured) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40, maxWidth: 400, margin: '40px auto' }}>
        <div className="empty" style={{ border: 'none' }}>
          <div className="big">🔌</div>
          <h3>Supabase 연결 필요</h3>
          <p style={{ color: 'var(--text-2)', fontWeight: 700, marginTop: 8 }}>
            .env 파일에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정해주세요.
          </p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let result
    if (mode === 'login') {
      result = await signInWithEmail(email, password)
    } else {
      result = await signUpWithEmail(email, password)
    }

    if (result?.error) {
      setError(result.error.message)
    } else {
      if (mode === 'signup') notify('가입 확인 이메일을 확인해주세요!')
    }
    setLoading(false)
  }

  return (
    <div className="card" style={{ maxWidth: 400, margin: '40px auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div className="leaf-logo" style={{ display: 'inline-flex', marginBottom: 12 }}><span>SubClean</span></div>
        <h2 className="brand-name" style={{ margin: 0 }}>SubClean</h2>
        <p style={{ color: 'var(--text-2)', fontWeight: 700, fontSize: 13, marginTop: 6 }}>
          🍎 나의 구독을 한눈에 관리하세요
        </p>
      </div>

      <button className="btn-provider primary" style={{ width: '100%', marginBottom: 16 }} onClick={async () => {
        setLoading(true)
        const result = await signInWithGoogle()
        if (result?.error) {
          setError(result.error.message)
          setLoading(false)
        }
      }} disabled={loading}>
        <span className="p-ico">G</span>
        <span>Google로 시작하기</span>
      </button>

      <div style={{ textAlign: 'center', color: 'var(--text-3)', fontWeight: 800, fontSize: 12, margin: '8px 0' }}>
        또는 이메일로 로그인
      </div>

      <form onSubmit={handleSubmit}>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>이메일</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="me@example.com" />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>비밀번호</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="6자 이상" />
        </div>

        {error && (
          <div className="trap" style={{ marginBottom: 12 }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        <button className="btn primary" style={{ width: '100%' }} type="submit" disabled={loading}>
          {loading ? '⏳ 처리 중...' : mode === 'login' ? '🍎 로그인' : '🌱 회원가입'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <button className="btn sm ghost" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? '계정이 없으신가요? 회원가입 →' : '이미 계정이 있으신가요? 로그인 →'}
        </button>
      </div>

      <div className="security-note" style={{ marginTop: 16 }}>
        <span>🔒</span>
        <span>비밀번호는 안전하게 암호화되어 저장됩니다. 외부 서비스 비밀번호를 저장하지 않습니다.</span>
      </div>
    </div>
  )
}
