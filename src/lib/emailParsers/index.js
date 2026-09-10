/**
 * emailParsers/index.js — 서비스별 이메일 파서 라우터
 *
 * 각 파서는 이메일 원문 또는 제목+본문을 받아
 *   { serviceName, eventType, planName, amount, currency, eventDate, trialEndDate, nextBillingDate }
 * 를 반환하거나 null을 반환한다.
 */

import { parseNaverEmail } from './naverParser.js'
import { parseCoupangEmail } from './coupangParser.js'
import { parseYoutubeEmail } from './youtubeParser.js'
import { parseChatGPTEmail } from './chatgptParser.js'
import { parseClaudeEmail } from './claudeParser.js'
import { parseGeminiEmail } from './geminiParser.js'
import { parseBaeminEmail } from './baeminParser.js'

const PARSERS = [
  { name: 'naver', match: /네이버|naver|네이버플러스|네이버 멤버십/i, parse: parseNaverEmail },
  { name: 'coupang', match: /쿠팡|coupang|와우 멤버십/i, parse: parseCoupangEmail },
  { name: 'youtube', match: /youtube|유튜브|youtube premium/i, parse: parseYoutubeEmail },
  { name: 'chatgpt', match: /chatgpt|openai|챗gpt/i, parse: parseChatGPTEmail },
  { name: 'claude', match: /claude|anthropic/i, parse: parseClaudeEmail },
  { name: 'gemini', match: /gemini/i, parse: parseGeminiEmail },
  { name: 'baemin', match: /배달의민족|배민|baemin/i, parse: parseBaeminEmail },
]

/**
 * 주어진 이메일 본문/제목을 모든 파서에 시도한다.
 * @param {string} subject - 이메일 제목
 * @param {string} body - 이메일 본문
 * @returns {object|null}
 */
export function parseEmail(subject = '', body = '') {
  const text = `${subject} ${body}`
  for (const parser of PARSERS) {
    if (parser.match.test(text)) {
      try {
        const result = parser.parse(subject, body)
        if (result) return { ...result, parser: parser.name }
      } catch (e) {
        console.warn(`[emailParser] ${parser.name} parse error:`, e)
        return { serviceName: parser.name, eventType: 'unknown', parser: parser.name }
      }
    }
  }
  return null
}

/**
 * Gmail API 메시지 목록을 받아 모두 파싱한다.
 * @param {Array} messages - Gmail 메시지 배열
 * @returns {Array} 파싱 결과 배열
 */
export function parseEmailBatch(messages) {
  return messages
    .map((msg) => {
      const subject = msg.subject || ''
      const body = msg.body || msg.snippet || ''
      return parseEmail(subject, body)
    })
    .filter(Boolean)
}
