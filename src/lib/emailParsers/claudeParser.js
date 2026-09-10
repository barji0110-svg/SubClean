/**
 * Claude Pro 이메일 파서
 */
export function parseClaudeEmail(subject, body) {
  const text = `${subject} ${body}`

  const result = {
    serviceName: 'Claude',
    eventType: 'unknown',
    planName: 'Pro',
    amount: null,
    currency: 'USD',
    eventDate: null,
    trialEndDate: null,
    nextBillingDate: null,
  }

  if (/receipt|payment|charged|결제|영수증/i.test(text)) {
    result.eventType = 'payment_completed'
  } else if (/next billing|will be charged|scheduled|next payment|다음 청구|예정/i.test(text)) {
    result.eventType = 'payment_scheduled'
  } else if (/cancel|cancelled|unsubscribed|해지/i.test(text)) {
    result.eventType = 'subscription_cancelled'
  } else if (/trial|무료|체험/i.test(text)) {
    if (/end|ending|종료|만료/i.test(text)) result.eventType = 'trial_ending'
    else result.eventType = 'trial_started'
  } else if (/refund|환불/i.test(text)) {
    result.eventType = 'refund'
  }

  if (/Claude\s*(Pro|Max|Team|Enterprise)/i.test(text)) {
    const planMatch = text.match(/Claude\s*(Pro|Max|Team|Enterprise)/i)
    result.planName = planMatch[1]
  }

  const amountMatch = text.match(/\$\s*(\d+\.?\d*)/)
  if (amountMatch) result.amount = parseFloat(amountMatch[1])

  const dateMatch = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
  if (dateMatch) {
    const d = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    if (/next billing|다음 청구|will be charged/i.test(text) || /scheduled|예정/i.test(text)) {
      result.nextBillingDate = d
    }
    result.eventDate = d
  }

  return result
}
