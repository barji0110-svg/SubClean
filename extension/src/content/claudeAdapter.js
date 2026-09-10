/**
 * Claude 구독 동기화 어댑터
 * 사용자가 claude.ai에 로그인한 상태에서만 동작합니다.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getSubscriptionInfo') return

  const result = {
    serviceName: 'Claude',
    planName: 'Pro',
    status: 'unknown',
    price: null,
    currency: 'USD',
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    syncedAt: new Date().toISOString(),
  }

  try {
    const planEl = document.querySelector('[class*="plan"], [class*="subscription"], .billing-plan')
    if (planEl) {
      const text = planEl.textContent
      if (text.includes('Pro')) result.planName = 'Pro'
      else if (text.includes('Max')) result.planName = 'Max'
      result.status = 'active'
    }

    const priceEl = document.querySelector('[class*="price"], [class*="amount"]')
    if (priceEl) {
      const m = priceEl.textContent.match(/\$\s*(\d+\.?\d*)/)
      if (m) result.price = parseFloat(m[1])
    }

    const cancelEl = document.querySelector('[class*="cancel"]')
    if (cancelEl && /cancel/i.test(cancelEl.textContent)) {
      result.cancelAtPeriodEnd = true
      result.status = 'cancelled'
    }

    sendResponse({ success: true, data: result })
  } catch (e) {
    sendResponse({ success: false, error: 'Claude 구독 정보를 읽을 수 없습니다.' })
  }
})
