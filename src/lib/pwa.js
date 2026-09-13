/**
 * PWA 등록 · 설치 상태 판별
 *
 * 서비스워커는 **프로덕션 빌드에서만** 등록한다. 개발 중에 켜 두면 캐시가
 * Vite 의 HMR 을 가로채 "고쳤는데 화면이 그대로"인 상황을 만든다.
 */

/** 홈 화면에서 실행 중인가 (주소창 없는 독립 실행) */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari 전용 비표준 속성
    window.navigator.standalone === true
  )
}

export function isIos() {
  const ua = window.navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ 는 데스크톱 Safari 로 위장하므로 터치 지원으로 가려낸다
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * 서비스워커 등록.
 * 새 버전이 준비되면 onUpdate 를 호출한다 (사용자에게 새로고침을 권하기 위해).
 */
export function registerServiceWorker({ onUpdate } = {}) {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing
          if (!sw) return
          sw.addEventListener('statechange', () => {
            // controller 가 이미 있다는 건 "첫 설치가 아니라 갱신"이라는 뜻
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              onUpdate?.(reg)
            }
          })
        })
      })
      .catch((e) => console.warn('[PWA] 서비스워커 등록 실패:', e))
  }

  // 등록을 load 뒤로 미뤄 첫 화면 렌더와 대역폭을 다투지 않게 한다.
  // 단 이 모듈이 load **이후에** 실행되는 경우(캐시된 재방문 등)에는
  // 리스너를 달아 봐야 영영 불리지 않으므로, 그때는 즉시 등록한다.
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

/** 대기 중인 새 서비스워커를 즉시 적용하고 새로고침한다 */
export function applyUpdate(reg) {
  reg?.waiting?.postMessage('SKIP_WAITING')
  // 새 워커가 제어권을 잡으면 한 번만 새로고침
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}
