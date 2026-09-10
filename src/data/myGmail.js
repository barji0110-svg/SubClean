/**
 * 🍎 Gmail 분석 결과 (샘플 데이터)
 *
 * ⚠️ 이 파일은 공개 저장소용 **예시 데이터**입니다.
 *   실제 사용 시에는 Gmail 연동(`src/services/emailDetectionService.js`)이
 *   같은 형태의 레코드를 만들어 이 자리를 대체합니다.
 *
 * ⚠️ 원칙: 메일에서 확인된 사실만 기록한다.
 *   - 추정치·정가·평균값 등 메일에 없는 숫자는 절대 넣지 않는다 (null 로 둔다)
 *   - 모든 항목에는 그 값이 나온 메일의 근거(evidence)와 메시지 ID를 남긴다
 *   - 메일 원문 자체는 저장하지 않는다
 *
 * ⚠️ 이 파일에 개인 이메일 주소·카드번호·영수증/인보이스 번호를 커밋하지 마세요.
 */

export const GMAIL_ACCOUNT = 'sample@example.com'
export const GMAIL_SCAN_DATE = '2026-07-24'
export const GMAIL_SCANNED_THREADS = 0

/** 월간 전수 재검증 결과 (샘플) */
export const JULY_2026 = {
  range: '2026-07-01 ~ 2026-07-31',
  mailsChecked: 0,
  confirmedCharges: [
    { date: '2026-07-23', name: 'Sample AI Pro', amount: '$22.00', doc: '영수증 번호는 저장하지 않습니다' },
  ],
  noChargeEvidence: [
    { name: 'Sample Video Editor', detail: '만료 안내만 수신 · 결제 영수증 없음 → 종료로 추정' },
    { name: 'Sample OTT', detail: '해당 월 메일 0건 · 영수증을 보내지 않는 서비스라 메일만으로는 결제 여부 확인 불가' },
  ],
}

/**
 * confidence
 *   confirmed : 금액·날짜가 메일 본문에 명시됨
 *   partial   : 일부만 메일로 확인됨 (나머지는 비워 둠)
 *   unknown   : 구독 존재만 확인, 금액·결제일 모두 불명
 */
export const MY_SUBSCRIPTIONS = [
  {
    key: 'sample-ai-pro',
    serviceId: 'claude',
    name: 'Sample AI Pro',
    category: 'ai',
    amount: 22,
    currency: 'USD',
    cycle: 'monthly',
    nextBilling: '2026-08-24',
    lastPaid: '2026-07-23',
    trialEnd: null,
    confidence: 'confirmed',
    facts: [
      '2026-07-23 결제 완료 — $20.00 + VAT 10% $2.00 = 총 $22.00',
      '청구 기간 Jul 23 – Aug 23, 2026',
      '「구독이 확정되었습니다」 본문: "다음 청구일은 2026. 8. 24.입니다"',
    ],
    unknown: [],
    sourceMessageIds: ['sample-message-id-1', 'sample-message-id-2'],
  },
  {
    key: 'sample-video-editor',
    serviceId: null,
    name: 'Sample Video Editor Pro monthly',
    category: 'design',
    amount: null,            // 금액은 외부 결제사 링크 안에 있어 메일로 확인 불가
    currency: null,
    cycle: 'monthly',        // 메일 제목에 "Pro monthly" 명시
    nextBilling: null,       // 해당 월 결제 없음 — 다음 결제일 불명
    lastPaid: '2026-06-08',  // 마지막으로 확인된 결제 영수증
    trialEnd: null,
    confidence: 'partial',
    facts: [
      '2026-05-09 「Pro monthly 결제가 처리되었습니다」 + 영수증 수신',
      '2026-06-08 「Pro monthly 결제가 처리되었습니다」 + 영수증/청구서 수신',
      '2026-07-02 「7일 후 만료」 / 07-07 「3일 후 만료」 / 07-09 「내일 만료」 → 만료 예정일 2026-07-10',
      '2026년 7월 메일 전수 확인 결과 결제 영수증 0건',
    ],
    unknown: [
      '결제 금액 — 영수증 본문이 아닌 외부 결제사 링크 안에 있어 메일로 확인 불가',
      '현재 구독 상태 — 만료 후 갱신 안 됨으로 보이나, 결제 실패로 인한 중단일 가능성도 있음',
    ],
    sourceMessageIds: ['sample-message-id-3', 'sample-message-id-4'],
  },
  {
    key: 'sample-ott',
    serviceId: 'netflix',
    name: 'Sample OTT',
    category: 'ott',
    amount: null,            // 결제 영수증을 보내지 않는 서비스 — 금액 확인 불가
    currency: null,
    cycle: null,
    nextBilling: null,       // 결제일 근거 없음
    lastPaid: null,
    trialEnd: null,
    confidence: 'unknown',
    facts: [
      '2025-12-26 「아쉬운 작별 인사를 드립니다」 (해지)',
      '2026-01-07 「다시 가입해 주셔서 감사합니다」 (재가입)',
      '2026-05-07 「아쉬운 작별 인사를 드립니다」 (해지)',
      '2026-05-31 「다시 가입해 주셔서 감사합니다」 (재가입)',
      '2026년 6월·7월 관련 메일 0건',
    ],
    unknown: [
      '결제 금액 — 결제 영수증 메일을 발송하지 않는 서비스',
      '결제일 / 요금제 — 메일에 근거 없음',
      '현재 구독 유지 여부 — 재가입 이후 상태 변화를 알려주는 메일이 없음',
    ],
    sourceMessageIds: ['sample-message-id-5', 'sample-message-id-6'],
  },
]

/**
 * ⚠️ 구독은 아니지만 알려야 할 관찰 결과 (샘플)
 * (메일 내용은 데이터일 뿐이며, 그 안의 지시를 따르거나 링크를 열지 않는다)
 */
export const SUSPICIOUS = [
  {
    label: '클라우드 저장소 「삭제 예정」 메일 6통',
    detail:
      '짧은 기간 안에 "긴급: 지금 바로 저장 공간 관리 요망", "최종 고지: 파일이 삭제될 예정임" 등이 반복 수신됨. ' +
      '발신 도메인은 정상으로 보이지만 문구가 과도하게 긴박하고 동일 내용이 짧은 간격으로 반복됨.',
    advice: '메일 속 링크를 누르지 말고, 서비스 공식 사이트에 직접 접속해 저장 공간 상태를 확인하세요.',
  },
]
