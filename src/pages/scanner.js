import { Html5Qrcode } from 'html5-qrcode'
import { t } from '../i18n/index.js'
import { navigate } from '../router.js'

let qrScanner = null

function isValidUrl(str) {
  try {
    const url = new URL(str)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function showError(app, message) {
  const existing = app.querySelector('.scanner__error')
  if (existing) existing.remove()

  const el = document.createElement('div')
  el.className = 'scanner__error'
  el.textContent = message
  app.querySelector('.scanner__viewport').appendChild(el)

  setTimeout(() => el.remove(), 3000)
}

async function stopScanner() {
  if (qrScanner) {
    try {
      await qrScanner.stop()
    } catch {
      // すでに停止済みの場合は無視
    }
    qrScanner = null
  }
}

export async function renderScanner(app) {
  app.innerHTML = `
    <div class="scanner">
      <div class="scanner__header">
        <button class="back-btn" id="back-btn">← <span data-i18n="viewer.back"></span></button>
      </div>
      <div class="scanner__viewport">
        <div id="qr-reader"></div>
        <p class="scanner__guide" data-i18n="scanner.guide"></p>
      </div>
    </div>
  `

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n)
  })

  app.querySelector('#back-btn').addEventListener('click', async () => {
    await stopScanner()
    navigate('/')
  })

  const guideEl = app.querySelector('.scanner__guide')
  guideEl.textContent = t('scanner.preparing')

  qrScanner = new Html5Qrcode('qr-reader')

  try {
    await qrScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        if (!isValidUrl(decodedText)) {
          showError(app, t('scanner.errorInvalidUrl'))
          return
        }

        await stopScanner()

        sessionStorage.setItem('currentHtmlUrl', decodedText)
        navigate('/viewer')
      },
      () => {} // スキャン失敗は無視（連続して呼ばれるため）
    )
    guideEl.textContent = t('scanner.guide')
  } catch {
    guideEl.textContent = t('scanner.errorCamera')
  }
}

// ページ離脱時にカメラを停止
window.addEventListener('hashchange', stopScanner)
