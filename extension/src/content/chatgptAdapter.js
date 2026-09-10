/**
 * ChatGPT 구독 동기화 어댑터
 * 사용자가 chat.openai.com에 로그인한 상태에서만 동작합니다.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getSubscriptionInfo') return

  const result = {
    serviceName: 'ChatGPT',
    planName: 'Plus',
    status: 'unknown',
    price: null,
    currency: 'USD',
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    syncedAt: new Date().toISOString(),
  }

  try {
    const planEl = document.querySelector('[data-testid="plan-name"], .plan-name, [class*="plan"]')
    if (planEl) {
      const text = planEl.textContent
      if (text.includes('Plus')) result.planName = 'Plus'
      else if (text.includes('Pro')) result.planName = 'Pro'
      else if (text.includes('Team')) result.planName = 'Team'
      result.status = 'active'
    }

    const cancelEl = document.querySelector('[class*="cancel"], [class*="cancelled"]')
    if (cancelEl) {
      result.cancelAtPeriodEnd = true
      result.status = 'cancelled'
    }

    sendResponse({ success: true, data: result })
  } catch (e) {
    sendResponse({ success: false, error: 'ChatGPT 구독 정보를 읽을 수 없습니다. Settings > My plan 페이지에서 실행해 주세요.' })
  }
})
