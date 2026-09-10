/**
 * 네이버 멤버십 동기화 어댑터
 * 사용자가 네이버에 로그인한 상태에서만 동작합니다.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getSubscriptionInfo') return

  const result = {
    serviceName: '네이버 멤버십',
    planName: null,
    status: 'unknown',
    price: null,
    currency: 'KRW',
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    syncedAt: new Date().toISOString(),
  }

  try {
    const membershipEl = document.querySelector('.membership_info, .membership_status, [class*="membership"]')
    if (membershipEl) {
      result.planName = membershipEl.textContent.trim().slice(0, 50)
      result.status = 'active'
    }

    const priceEl = document.querySelector('.price, .amount, [class*="price"]')
    if (priceEl) {
      const m = priceEl.textContent.match(/([\d,]+)\s*원/)
      if (m) result.price = parseInt(m[1].replace(/,/g, ''))
    }

    sendResponse({ success: true, data: result })
  } catch (e) {
    sendResponse({ success: false, error: '네이버 멤버십 정보를 읽을 수 없습니다. 멤버십 페이지에서 실행해 주세요.' })
  }
})
