/**
 * 배달의민족 동기화 어댑터
 * 사용자가 배민에 로그인한 상태에서만 동작합니다.
 * 주문 내역, 배달비, 할인 정보 등을 읽습니다.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getSubscriptionInfo') return

  const result = {
    serviceName: '배달의민족',
    planName: null,
    status: 'active',
    price: null,
    currency: 'KRW',
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    syncedAt: new Date().toISOString(),
    orders: [],
  }

  try {
    const orderEls = document.querySelectorAll('.order-card, .order-item, [class*="order"]')
    orderEls.forEach((el) => {
      const nameEl = el.querySelector('.restaurant-name, .shop-name, [class*="name"]')
      const priceEl = el.querySelector('.price, .amount, [class*="price"]')
      const dateEl = el.querySelector('.date, .time, [class*="date"]')

      const order = {
        restaurantName: nameEl ? nameEl.textContent.trim() : '알 수 없음',
        orderAmount: null,
        deliveryFee: null,
        discountAmount: null,
        paymentAmount: null,
        orderedAt: null,
      }

      if (priceEl) {
        const m = priceEl.textContent.match(/([\d,]+)\s*원/g)
        if (m) {
          const nums = m.map((s) => parseInt(s.replace(/[,원]/g, '')))
          order.paymentAmount = nums[nums.length - 1]
        }
      }

      if (dateEl) {
        const m = dateEl.textContent.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
        if (m) order.orderedAt = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      }

      result.orders.push(order)
    })

    const baeminClubEl = document.querySelector('[class*="club"], [class*="membership"]')
    if (baeminClubEl && /배민클럽/i.test(baeminClubEl.textContent)) {
      result.planName = '배민클럽'
      result.price = 3990
    }

    sendResponse({ success: true, data: result })
  } catch (e) {
    sendResponse({ success: false, error: '배달의민족 정보를 읽을 수 없습니다. 주문 내역 페이지에서 실행해 주세요.' })
  }
})
