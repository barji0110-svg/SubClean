/**
 * Gemini 이메일 파서
 */
export function parseGeminiEmail(subject, body) {
  const text = `${subject} ${body}`

  const result = {
    serviceName: 'Gemini',
    eventType: 'unknown',
    planName: 'Advanced',
    amount: null,
    currency: 'USD',
    eventDate: null,
    trialEndDate: null,
    nextBillingDate: null,
  }

  if (/trial|무료|체험/i.test(text)) {
    if (/end|ending|종료/i.test(text)) result.eventType = 'trial_ending'
    else result.eventType = 'trial_started'
  } else if (/receipt|payment|charged|결제|영수증|청구/i.test(text)) {
    result.eventType = 'payment_completed'
  } else if (/next billing|scheduled|will be charged|예정|갱신/i.test(text)) {
    result.eventType = 'payment_scheduled'
  } else if (/cancel|cancelled|해지/i.test(text)) {
    result.eventType = 'subscription_cancelled'
  }

  if (/Gemini\s*(Advanced|Business|Enterprise)/i.test(text)) {
    const planMatch = text.match(/Gemini\s*(Advanced|Business|Enterprise)/i)
    result.planName = planMatch[1]
  }

  const amountMatch = text.match(/(\d+\.?\d*)\s*(달러|\$|USD)/i)
  if (amountMatch) result.amount = parseFloat(amountMatch[1])

  const dateMatch = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
  if (dateMatch) {
    result.eventDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    result.nextBillingDate = result.eventDate
  }

  return result
}
