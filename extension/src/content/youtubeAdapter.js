/**
 * YouTube Premium 동기화 어댑터
 * 사용자가 YouTube에 로그인한 상태에서만 동작합니다.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getSubscriptionInfo') return

  const result = {
    serviceName: 'YouTube Premium',
    planName: 'Premium',
    status: 'unknown',
    price: null,
    currency: 'KRW',
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    syncedAt: new Date().toISOString(),
  }

  try {
    const paidMemberships = document.querySelector('a[href*="paid_memberships"], [href*="membership"]')
    const pricingEl = document.querySelector('.pricing-line, .membership-price, [class*="price"]')
    if (pricingEl) {
      const m = pricingEl.textContent.match(/([\d,]+)\s*원/)
      if (m) result.price = parseInt(m[1].replace(/,/g, ''))
    }

    const statusEl = document.querySelector('.membership-status, [class*="membership"]')
    if (statusEl) {
      if (/cancel|해지/i.test(statusEl.textContent)) {
        result.status = 'cancelled'
        result.cancelAtPeriodEnd = true
      } else if (/active|premium/i.test(statusEl.textContent)) {
        result.status = 'active'
      }
    }

    const dateEl = document.querySelector('.next-payment, [class*="payment"]')
    if (dateEl) {
      const m = dateEl.textContent.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
      if (m) result.nextBillingDate = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    }

    sendResponse({ success: true, data: result })
  } catch (e) {
    sendResponse({ success: false, error: 'YouTube Premium 정보를 읽을 수 없습니다.' })
  }
})
