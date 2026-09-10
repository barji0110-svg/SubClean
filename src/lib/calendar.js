/**
 * 📅 구독 결제일 → 캘린더 연동 (완전 로컬 · 외부 API 미사용)
 *
 *  1) makeIcs()          : .ics 파일 생성 → 구글 캘린더 "가져오기"로 반복 일정 + 알림 등록
 *  2) googleCalendarUrl(): 구글 캘린더 일정 추가 화면을 미리 채워 열어주는 링크
 *
 * 알림은 캘린더 쪽 VALARM 으로 걸리므로 앱이 꺼져 있어도 울린다.
 */

import { STATUS } from './storage.js'
import { formatMoney, CYCLE_LABEL, dday } from './dates.js'
import { SERVICE_MAP } from '../data/services.js'

const RRULE = {
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  quarterly: 'FREQ=MONTHLY;INTERVAL=3',
  yearly: 'FREQ=YEARLY',
}

/** 2026-08-24 → 20260824 */
function ymd(iso) {
  return iso ? iso.replace(/-/g, '') : null
}

/** 하루 뒤 (종일 일정의 DTEND는 exclusive) */
function nextDay(iso) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return ymd(d.toISOString().slice(0, 10))
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

/** ICS 규격상 특수문자 이스케이프 */
function esc(s = '') {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** 75옥텟 폴딩 (구글 캘린더 파서 호환) */
function fold(line) {
  if (line.length <= 73) return line
  const out = []
  let rest = line
  out.push(rest.slice(0, 73))
  rest = rest.slice(73)
  while (rest.length > 72) {
    out.push(' ' + rest.slice(0, 72))
    rest = rest.slice(72)
  }
  if (rest) out.push(' ' + rest)
  return out.join('\r\n')
}

function eventTitle(sub, isTrial) {
  const money = sub.amount != null ? ` ${formatMoney(sub.amount, sub.currency)}` : ''
  return isTrial
    ? `🥺 ${sub.name} 무료체험 종료 — 유료 전환${money}`
    : `🍎 ${sub.name} 자동결제${money}`
}

function eventBody(sub, isTrial) {
  const svc = sub.serviceId ? SERVICE_MAP[sub.serviceId] : null
  const lines = [
    isTrial
      ? '오늘 무료체험이 끝나고 정가로 자동 전환됩니다.'
      : '오늘 자동결제가 예정되어 있습니다.',
    '',
    `· 금액: ${sub.amount != null ? formatMoney(sub.amount, sub.currency) : '미확인'} / ${CYCLE_LABEL[sub.cycle] || '월간'}`,
  ]
  if (svc) {
    lines.push(`· 해지 경로: ${svc.cancelPath}`)
    if (svc.cancelUrl) lines.push(`· 해지 페이지: ${svc.cancelUrl}`)
    if (svc.traps?.length) {
      lines.push('', '⚠️ 주의:')
      svc.traps.forEach((t) => lines.push(`  - ${t}`))
    }
  }
  if (sub.evidence) lines.push('', `· 감지 근거: ${sub.evidence}`)
  lines.push('', '— SubClean 🍎에서 등록한 일정')
  return lines.join('\n')
}

/**
 * 구독 목록 → .ics 문자열
 * @param {Array} subs
 * @param {{alarmDays?: number[]}} opts 며칠 전에 알림을 울릴지 (기본 3일 전 · 1일 전 · 당일 아침)
 */
export function makeIcs(subs, { alarmDays = [3, 1] } = {}) {
  const now = stamp()
  const out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SubClean//Apple Farm//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SubClean 구독 결제일 🍎',
    'X-WR-TIMEZONE:Asia/Seoul',
  ]

  let count = 0

  for (const sub of subs) {
    if (sub.status === STATUS.CANCELLED) continue

    const targets = []
    if (sub.trialEnd && dday(sub.trialEnd) >= 0) {
      targets.push({ date: sub.trialEnd, isTrial: true, repeat: false })
    }
    if (sub.nextBilling) {
      targets.push({ date: sub.nextBilling, isTrial: false, repeat: true })
    }

    for (const t of targets) {
      count += 1
      const uid = `${sub.id}-${t.isTrial ? 'trial' : 'bill'}@subclean.local`
      out.push('BEGIN:VEVENT')
      out.push(`UID:${uid}`)
      out.push(`DTSTAMP:${now}`)
      out.push(`DTSTART;VALUE=DATE:${ymd(t.date)}`)
      out.push(`DTEND;VALUE=DATE:${nextDay(t.date)}`)
      out.push(fold(`SUMMARY:${esc(eventTitle(sub, t.isTrial))}`))
      out.push(fold(`DESCRIPTION:${esc(eventBody(sub, t.isTrial))}`))
      out.push('TRANSP:TRANSPARENT')
      if (t.repeat && RRULE[sub.cycle]) out.push(`RRULE:${RRULE[sub.cycle]}`)

      // 며칠 전 알림
      for (const d of alarmDays) {
        out.push('BEGIN:VALARM')
        out.push('ACTION:DISPLAY')
        out.push(fold(`DESCRIPTION:${esc(`${sub.name} ${d}일 뒤 결제 — 해지하려면 지금이 마지막 기회예요 🍎`)}`))
        out.push(`TRIGGER:-P${d}D`)
        out.push('END:VALARM')
      }
      // 당일 오전 9시
      out.push('BEGIN:VALARM')
      out.push('ACTION:DISPLAY')
      out.push(fold(`DESCRIPTION:${esc(`오늘 ${sub.name} 결제돼요! 🚨`)}`))
      out.push('TRIGGER:PT9H')
      out.push('END:VALARM')

      out.push('END:VEVENT')
    }
  }

  out.push('END:VCALENDAR')
  return { ics: out.join('\r\n'), count }
}

/** .ics 파일 내려받기 */
export function downloadIcs(subs, opts) {
  const { ics, count } = makeIcs(subs, opts)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `subclean-구독일정-${new Date().toISOString().slice(0, 10)}.ics`
  a.click()
  URL.revokeObjectURL(url)
  return count
}

/** 구글 캘린더 "일정 추가" 화면을 미리 채워서 여는 링크 */
export function googleCalendarUrl(sub, { isTrial = false } = {}) {
  const date = isTrial ? sub.trialEnd : sub.nextBilling
  if (!date) return null
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventTitle(sub, isTrial),
    dates: `${ymd(date)}/${nextDay(date)}`,
    details: eventBody(sub, isTrial),
    ctz: 'Asia/Seoul',
  })
  const url = `https://calendar.google.com/calendar/render?${p.toString()}`
  return !isTrial && RRULE[sub.cycle]
    ? `${url}&recur=${encodeURIComponent(`RRULE:${RRULE[sub.cycle]}`)}`
    : url
}
