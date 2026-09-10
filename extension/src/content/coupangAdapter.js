/**
 * 쿠팡 와우 멤버십 동기화 어댑터
 * 사용자가 쿠팡에 로그인한 상태에서만 동작합니다.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getSubscriptionInfo') return

  const result = {
    serviceName: '쿠팡 와우 멤버십',
    planName: '와우 멤버십',
    status: 'unknown',
    price: 7890,
    currency: 'KRW',
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    syncedAt: new Date().toISOString(),
  }

  try {
    const membershipEl = document.querySelector('.membership-badge, .membership-status, [class*="membership"]')
    if (membershipEl && membershipEl.textContent.includes('와우')) {
      result.status = 'active'
    }

    const dateEl = document.querySelector('.next-payment, .payment-date, [class*="payment"]')
    if (dateEl) {
      const m = dateEl.textContent.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
      if (m) result.nextBillingDate = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    }

    const cancelEl = document.querySelector('.cancel-status, [class*="cancel"]')
    if (cancelEl && /해지|예약|cancel/i.test(cancelEl.textContent)) {
      result.cancelAtPeriodEnd = true
    }

    sendResponse({ success: true, data: result })
  } catch (e) {
    sendResponse({ success: false, error: '쿠팡 와우 멤버십 정보를 읽을 수 없습니다.' })
  }
})
