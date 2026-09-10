/**
 * SubClean Extension - Service Worker
 * 브라우저 확장 프로그램의 백그라운드 서비스 워커
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('SubClean Sync 확장 프로그램이 설치되었습니다.')
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ ok: true, version: '1.0.0' })
    return
  }

  if (request.action === 'sync') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: '활성 탭을 찾을 수 없습니다' })
        return
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getSubscriptionInfo' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: '페이지에서 정보를 읽을 수 없습니다. 해당 서비스 페이지에서 실행해 주세요.' })
          return
        }
        sendResponse(response || { success: false, error: '응답 없음' })
      })
    })
    return true
  }
})
