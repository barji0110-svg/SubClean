/**
 * 네이버 멤버십 이메일 파서
 */
export function parseNaverEmail(subject, body) {
  const text = `${subject} ${body}`

  const result = {
    serviceName: '네이버 멤버십',
    eventType: 'unknown',
    planName: null,
    amount: null,
    currency: 'KRW',
    eventDate: null,
    trialEndDate: null,
    nextBillingDate: null,
  }

  if (/무료\s*체험|무료\s*이용|체험\s*시작/i.test(text)) {
    result.eventType = 'trial_started'
  } else if (/무료\s*체험\s*종료|체험\s*만료|trial\s*end/i.test(text)) {
    result.eventType = 'trial_ending'
  } else if (/결제\s*예정|갱신\s*예정|자동\s*결제\s*안내/i.test(text)) {
    result.eventType = 'payment_scheduled'
  } else if (/결제\s*완료|결제되었|영수증|receipt/i.test(text)) {
    result.eventType = 'payment_completed'
  } else if (/해지\s*완료|구독\s*해지|cancelled/i.test(text)) {
    result.eventType = 'subscription_cancelled'
  } else if (/환불|refund/i.test(text)) {
    result.eventType = 'refund'
  }

  const planMatch = text.match(/(네이버플러스|네이버 플러스|멤버십)\s*(스탠다드|프리미엄|Standard|Premium)?/i)
  if (planMatch) result.planName = planMatch[0].trim()

  const amountMatch = text.match(/(\d[\d,]*)\s*원/)
  if (amountMatch) result.amount = parseInt(amountMatch[1].replace(/,/g, ''))

  const dateMatch = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
  if (dateMatch) {
    const d = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    if (result.eventType === 'trial_ending' || result.eventType === 'trial_started') {
      result.trialEndDate = d
    } else {
      result.nextBillingDate = d
      result.eventDate = d
    }
  }

  return result
}
