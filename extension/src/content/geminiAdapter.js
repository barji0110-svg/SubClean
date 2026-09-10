/**
 * Gemini 구독 동기화 어댑터
 * 사용자가 gemini.google.com에 로그인한 상태에서만 동작합니다.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getSubscriptionInfo') return

  const result = {
    serviceName: 'Gemini',
    planName: 'Advanced',
    status: 'unknown',
    price: null,
    currency: 'USD',
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    syncedAt: new Date().toISOString(),
  }

  try {
    const planEl = document.querySelector('[class*="plan"], [class*="subscription"], [class*="membership"]')
    if (planEl) {
      const text = planEl.textContent
      if (text.includes('Advanced')) result.planName = 'Advanced'
      else if (text.includes('Business')) result.planName = 'Business'
      result.status = 'active'
    }

    const priceEl = document.querySelector('[class*="price"], [class*="amount"]')
    if (priceEl) {
      const m = priceEl.textContent.match(/(\d+\.?\d*)\s*(달러|\$)/)
      if (m) result.price = parseFloat(m[1])
    }

    sendResponse({ success: true, data: result })
  } catch (e) {
    sendResponse({ success: false, error: 'Gemini 구독 정보를 읽을 수 없습니다.' })
  }
})
