/** 해지 요청 문구 자동 생성 (로컬 문자열 조합) */

import { formatKDate, formatMoney, CYCLE_LABEL } from './dates.js'

export const TEMPLATE_KINDS = [
  { id: 'email', label: '이메일 (정식 해지 요청)' },
  { id: 'chat', label: '고객센터 채팅 (짧게)' },
  { id: 'phone', label: '전화 상담 스크립트' },
  { id: 'refund', label: '무료체험 직후 환불 요청' },
  { id: 'card', label: '카드사 정기결제 차단 요청' },
]

function ctx(sub, profile) {
  return {
    name: sub.name || '(서비스명)',
    account: profile.accountId || '(가입 계정/이메일)',
    holder: profile.holderName || '(가입자 성함)',
    phone: profile.phone || '(연락처)',
    amount: sub.amount != null ? formatMoney(sub.amount, sub.currency) : '(결제 금액)',
    cycle: CYCLE_LABEL[sub.cycle] || '월간',
    next: sub.nextBilling ? formatKDate(sub.nextBilling) : '(다음 결제일)',
    trial: sub.trialEnd ? formatKDate(sub.trialEnd) : null,
    today: formatKDate(new Date().toISOString().slice(0, 10)),
  }
}

export function generateTemplate(kind, sub, profile = {}) {
  const c = ctx(sub, profile)

  if (kind === 'email') {
    return [
      `제목: [해지 요청] ${c.name} 정기결제 해지 및 자동갱신 중지 요청`,
      ``,
      `${c.name} 고객센터 담당자님께,`,
      ``,
      `안녕하세요. 아래 계정으로 ${c.name}을(를) 이용 중인 ${c.holder}입니다.`,
      `${c.cycle} 정기결제의 해지 및 자동갱신 중지를 요청드립니다.`,
      ``,
      `- 가입 계정 : ${c.account}`,
      `- 연락처 : ${c.phone}`,
      `- 결제 금액 : ${c.amount} (${c.cycle})`,
      `- 다음 결제 예정일 : ${c.next}`,
      c.trial ? `- 무료체험 종료일 : ${c.trial}` : null,
      ``,
      `다음 결제일 이전에 해지 처리가 완료되어 추가 청구가 발생하지 않도록 조치 부탁드립니다.`,
      `처리 완료 후, 해지 처리 일자와 최종 이용 종료일이 명시된 확인 메일을 회신해 주시면 감사하겠습니다.`,
      ``,
      `감사합니다.`,
      `${c.holder} 드림 (${c.today})`,
    ]
      .filter((l) => l !== null)
      .join('\n')
  }

  if (kind === 'chat') {
    return [
      `안녕하세요. ${c.name} 정기결제 해지를 요청합니다.`,
      `가입 계정은 ${c.account} 이고, 다음 결제 예정일은 ${c.next} 입니다.`,
      `해당 결제일 이전에 자동갱신을 중지해 주시고, 처리 완료되면 해지 확인 내용을 이 대화창에 남겨 주세요.`,
      `할인 혜택이나 일시정지 제안은 필요 없으며, 해지로 바로 진행 부탁드립니다.`,
    ].join('\n')
  }

  if (kind === 'phone') {
    return [
      `[전화 상담 스크립트 · ${c.name}]`,
      ``,
      `1) 첫 마디`,
      `   "${c.name} 정기결제 해지하려고 전화드렸습니다."`,
      ``,
      `2) 본인 확인용으로 미리 준비`,
      `   · 가입 계정 : ${c.account}`,
      `   · 가입자명 : ${c.holder}`,
      `   · 연락처 : ${c.phone}`,
      `   · 다음 결제 예정일 : ${c.next}`,
      ``,
      `3) 만류 제안이 나올 때`,
      `   "할인이나 일시정지는 원하지 않습니다. 해지로 진행해 주세요."`,
      ``,
      `4) 반드시 받아낼 것 (통화 종료 전)`,
      `   · 해지 접수 번호 / 상담사 성함`,
      `   · 최종 이용 종료일`,
      `   · 추가 청구가 없다는 확인`,
      `   "해지 확인 문자나 메일 발송해 주실 수 있을까요?"`,
      ``,
      `5) 통화 후`,
      `   확인 문자/메일 수신 여부를 ${c.next} 이전에 다시 점검`,
    ].join('\n')
  }

  if (kind === 'refund') {
    return [
      `제목: [환불 요청] ${c.name} 무료체험 종료 후 자동결제 건 환불 요청`,
      ``,
      `안녕하세요. ${c.holder}입니다.`,
      ``,
      `${c.name}의 무료체험을 이용하였으나, ${c.trial || '체험 종료일'} 이후 유료 전환 의사가 없었음에도`,
      `${c.amount}이(가) 자동으로 결제되었습니다.`,
      ``,
      `- 가입 계정 : ${c.account}`,
      `- 결제 금액 : ${c.amount}`,
      `- 결제일 : ${c.next}`,
      ``,
      `서비스를 유료 전환 이후 실질적으로 이용하지 않았으므로, 해당 결제 건의 환불과 함께`,
      `정기결제 해지 처리를 요청드립니다.`,
      `처리 결과를 회신해 주시면 감사하겠습니다.`,
      ``,
      `${c.holder} 드림 (${c.today})`,
    ].join('\n')
  }

  if (kind === 'card') {
    return [
      `[카드사 상담 요청 문구]`,
      ``,
      `"${c.name} 가맹점으로 등록된 정기결제(자동납부) 건을 차단하고 싶습니다."`,
      ``,
      `· 가맹점명 : ${c.name}`,
      `· 결제 금액 : ${c.amount} (${c.cycle})`,
      `· 다음 결제 예정일 : ${c.next}`,
      `· 요청 내용 : 해당 가맹점 정기결제 등록 해제 및 향후 승인 차단`,
      ``,
      `※ 주의`,
      `  카드 차단은 "결제만" 막는 조치입니다. 서비스 측 계약은 그대로 남아`,
      `  미납/연체로 처리될 수 있으므로, 반드시 서비스 자체 해지를 함께 진행하세요.`,
    ].join('\n')
  }

  return ''
}
