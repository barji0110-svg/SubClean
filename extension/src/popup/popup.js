document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status')
  const syncBtn = document.getElementById('syncBtn')
  const resultEl = document.getElementById('result')

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true
    syncBtn.textContent = '⏳ 동기화 중...'
    statusEl.textContent = '🔄 정보를 확인하고 있어요...'
    statusEl.className = 'status'
    resultEl.style.display = 'none'

    chrome.runtime.sendMessage({ action: 'sync' }, (response) => {
      syncBtn.disabled = false
      syncBtn.textContent = '🔄 지금 동기화'

      if (response && response.success) {
        statusEl.textContent = '✅ 동기화 완료!'
        statusEl.className = 'status'
        const d = response.data
        resultEl.style.display = 'block'
        resultEl.innerHTML = `
          <div><strong>${d.serviceName}</strong></div>
          <div>📋 플랜: ${d.planName || '—'}</div>
          <div>💰 ${d.price ? (d.currency === 'USD' ? '$' + d.price : '₩' + d.price.toLocaleString()) : '—'}</div>
          <div>📅 다음 결제: ${d.nextBillingDate || '—'}</div>
          <div>✅ 동기화 시간: ${new Date(d.syncedAt).toLocaleString()}</div>
        `
      } else {
        const err = response?.error || '동기화에 실패했습니다'
        statusEl.textContent = '❌ ' + err
        statusEl.className = 'status error'
        resultEl.style.display = 'block'
        resultEl.innerHTML = `<div class="error-text">${err}</div>`
      }
    })
  })
})
