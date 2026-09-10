/**
 * YouTube Premium 이메일 파서
 */
export function parseYoutubeEmail(subject, body) {
  const text = `${subject} ${body}`

  const result = {
    serviceName: 'YouTube Premium',
    eventType: 'unknown',
    planName: 'Premium',
    amount: null,
    currency: 'KRW',
    eventDate: null,
    trialEndDate: null,
    nextBillingDate: null,
  }

  if (/무료\s*체험|free\s*trial|첫\s*달\s*무료/i.test(text)) {
    result.eventType = 'trial_started'
    result.planName = 'Premium (무료 체험)'
  } else if (/체험\s*종료|trial\s*ends|trial\s*will\s*end/i.test(text)) {
    result.eventType = 'trial_ending'
  } else if (/결제|payment|charged|가격\s*인상|price\s*increase/i.test(text)) {
    result.eventType = 'payment_scheduled'
  } else if (/해지|cancel|cancelled/i.test(text)) {
    result.eventType = 'subscription_cancelled'
  }

  const amountMatch = text.match(/(\d[\d,]*\.?\d*)\s*(원|달러|\$|KRW)/i)
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1].replace(/,/g, ''))
    result.currency = amountMatch[2].match(/원|KRW/i) ? 'KRW' : 'USD'
  }

  const dateMatch = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
  if (dateMatch) {
    const d = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    if (result.eventType === 'trial_ending') result.trialEndDate = d
    else { result.eventDate = d; result.nextBillingDate = d }
  }

  return result
}
