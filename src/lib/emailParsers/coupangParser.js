/**
 * 쿠팡 와우 멤버십 이메일 파서
 */
export function parseCoupangEmail(subject, body) {
  const text = `${subject} ${body}`

  const result = {
    serviceName: '쿠팡 와우 멤버십',
    eventType: 'unknown',
    planName: '와우 멤버십',
    amount: null,
    currency: 'KRW',
    eventDate: null,
    trialEndDate: null,
    nextBillingDate: null,
  }

  if (/무료\s*체험|첫\s*달\s*무료|free\s*trial/i.test(text)) {
    result.eventType = 'trial_started'
  } else if (/결제\s*예정|갱신|renew/i.test(text)) {
    result.eventType = 'payment_scheduled'
  } else if (/결제\s*완료|결제되었|영수증|receipt/i.test(text)) {
    result.eventType = 'payment_completed'
  } else if (/해지|cancelled/i.test(text)) {
    result.eventType = 'subscription_cancelled'
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
