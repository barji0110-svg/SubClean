/**
 * 배달의민족 이메일 파서
 */
export function parseBaeminEmail(subject, body) {
  const text = `${subject} ${body}`

  const result = {
    serviceName: '배달의민족',
    eventType: 'unknown',
    planName: null,
    amount: null,
    currency: 'KRW',
    eventDate: null,
    trialEndDate: null,
    nextBillingDate: null,
  }

  if (/주문\s*완료|주문이\s*접수|order\s*confirmed/i.test(text)) {
    result.eventType = 'order_completed'
  } else if (/결제\s*완료|결제되었|payment\s*completed/i.test(text)) {
    result.eventType = 'payment_completed'
  } else if (/주문\s*취소|cancelled|order\s*cancelled/i.test(text)) {
    result.eventType = 'order_cancelled'
  } else if (/환불|refund/i.test(text)) {
    result.eventType = 'refund'
  } else if (/배민클럽|baemin\s*club/i.test(text)) {
    result.planName = '배민클럽'
    if (/결제|payment|charged/i.test(text)) result.eventType = 'payment_completed'
    else if (/해지|cancel/i.test(text)) result.eventType = 'subscription_cancelled'
    else if (/무료|trial/i.test(text)) result.eventType = 'trial_started'
  }

  const amountMatch = text.match(/(\d[\d,]*)\s*원/)
  if (amountMatch) result.amount = parseInt(amountMatch[1].replace(/,/g, ''))

  const dateMatch = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
  if (dateMatch) {
    result.eventDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    result.nextBillingDate = result.eventDate
  }

  return result
}
