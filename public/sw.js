/**
 * SubClean 서비스워커
 *
 * 목표는 "오프라인에서도 앱이 열린다" 하나다. 데이터 자체는 이미 localStorage 에
 * 있으므로, 껍데기(HTML·JS·CSS·폰트)만 캐시하면 비행기 모드에서도 동작한다.
 *
 * 원칙
 *   - **같은 출처의 GET 만** 건드린다. Supabase·Google API 응답을 캐시하면
 *     남의 계정 데이터나 만료된 토큰을 되돌려주는 사고가 난다. 절대 손대지 않는다.
 *   - 화면 이동(navigate)은 **네트워크 우선**. 배포 직후 옛 화면이 남지 않게 한다.
 *   - `/assets/*` 는 Vite 가 내용 해시를 파일명에 박으므로 **캐시 우선**이 안전하다.
 *     내용이 바뀌면 파일명이 바뀌니 낡은 걸 줄 수가 없다.
 */

const VERSION = 'subclean-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`

/** 오프라인 첫 진입에 필요한 최소 껍데기 */
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // 하나라도 실패하면 설치 전체가 실패하므로 개별적으로 담는다
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // GET 이 아니면 그대로 통과 (POST 등은 캐시 대상이 아니다)
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 다른 출처(Supabase·Google)는 절대 건드리지 않는다
  if (url.origin !== self.location.origin) return

  // 화면 이동: 네트워크 우선 → 실패 시 캐시된 셸
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    )
    return
  }

  // 해시가 박힌 정적 자원 + 폰트: 캐시 우선
  const isImmutable = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')
  const isIcon = url.pathname.startsWith('/icons/')

  if (isImmutable || isIcon) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSETS).then((c) => c.put(request, copy)).catch(() => {})
            }
            return res
          }),
      ),
    )
  }
  // 그 밖의 같은 출처 GET 은 기본 동작에 맡긴다
})

/** 앱에서 즉시 갱신을 요청할 때 */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
