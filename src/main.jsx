import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './lib/auth.jsx'
import { registerServiceWorker, applyUpdate } from './lib/pwa.js'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)

// 새 버전이 배포되면 사용자에게 알리고, 동의하면 바로 적용한다.
// (조용히 갱신하면 편집 중이던 화면이 날아갈 수 있어 물어본다)
registerServiceWorker({
  onUpdate: (reg) => {
    if (window.confirm('🍎 SubClean 새 버전이 준비됐어요. 지금 새로고침할까요?')) {
      applyUpdate(reg)
    }
  },
})
