import * as pdfjsLib from 'pdfjs-dist'
import { t, getLang, setLang, applyToDOM } from '../i18n/index.js'
import { navigate } from '../router.js'
import { parsePdfUrls, pickPdfUrl } from '../services/htmlParser.js'
import { extractPageContent } from '../services/pdfExtractor.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'zh', label: '中文' },
]

// モジュールスコープの状態
let pdfDoc = null
let currentPage = 1
let urlMap = {}
let mode = 'reader'  // 'reader' | 'pdf'
let readerBlobUrls = []  // メモリ解放用

// --- PDF Mode（現行・ページ送り）---

async function renderPdfPage(container, pageNum) {
  const page = await pdfDoc.getPage(pageNum)
  const scale = window.devicePixelRatio || 1
  const viewport = page.getViewport({
    scale: (container.clientWidth / page.getViewport({ scale: 1 }).width) * scale,
  })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / scale}px`
  canvas.style.height = `${viewport.height / scale}px`

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas
}

async function showPdfMode(app) {
  const container = app.querySelector('.viewer__canvas-container')
  const footer = app.querySelector('.viewer__footer')
  container.innerHTML = ''
  footer.style.display = 'flex'

  const canvas = await renderPdfPage(container, currentPage)
  container.appendChild(canvas)
  updatePdfFooter(app)
}

function updatePdfFooter(app) {
  app.querySelector('#prev-btn').disabled = currentPage <= 1
  app.querySelector('#next-btn').disabled = currentPage >= pdfDoc.numPages
  app.querySelector('.viewer__page-info').textContent =
    t('viewer.page', { current: currentPage, total: pdfDoc.numPages })
}

async function goToPage(app, pageNum) {
  if (!pdfDoc || pageNum < 1 || pageNum > pdfDoc.numPages) return
  currentPage = pageNum
  const container = app.querySelector('.viewer__canvas-container')
  container.innerHTML = ''
  const canvas = await renderPdfPage(container, currentPage)
  container.appendChild(canvas)
  container.scrollTo(0, 0)
  updatePdfFooter(app)
}

// --- Reader Mode（全ページ縦スクロール）---

async function showReaderMode(app) {
  const container = app.querySelector('.viewer__canvas-container')
  const footer = app.querySelector('.viewer__footer')
  footer.style.display = 'none'
  app.querySelector('.viewer__page-info').textContent = ''

  container.innerHTML = `<div class="viewer__state"><p data-i18n="viewer.loading"></p></div>`
  applyToDOM()

  // 以前のBlob URLを解放
  readerBlobUrls.forEach(url => URL.revokeObjectURL(url))
  readerBlobUrls = []

  const fragment = document.createDocumentFragment()

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const contentItems = await extractPageContent(page)

    for (const item of contentItems) {
      if (item.type === 'image') {
        readerBlobUrls.push(item.blobUrl)
        const img = document.createElement('img')
        img.className = 'reader-content__image'
        img.src = item.blobUrl
        fragment.appendChild(img)
      } else {
        const lines = item.content.split('\n').filter(l => l.trim())
        if (!lines.length) continue
        const textEl = document.createElement('div')
        textEl.className = 'reader-content__text'
        lines.forEach(line => {
          const p = document.createElement('p')
          p.className = 'reader-content__paragraph'
          p.textContent = line
          textEl.appendChild(p)
        })
        fragment.appendChild(textEl)
      }
    }

    // ページ区切り（最終ページ以外）
    if (i < pdfDoc.numPages) {
      const divider = document.createElement('div')
      divider.className = 'reader-content__divider'
      fragment.appendChild(divider)
    }
  }

  container.innerHTML = ''
  container.appendChild(fragment)
  container.scrollTo(0, 0)
}

// --- PDF読み込み ---

async function loadPdf(app, pdfUrl) {
  const container = app.querySelector('.viewer__canvas-container')
  const footer = app.querySelector('.viewer__footer')

  container.innerHTML = `<div class="viewer__state"><p data-i18n="viewer.loading"></p></div>`
  applyToDOM()
  footer.style.display = 'none'

  try {
    pdfDoc = await pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/cmaps/',
      cMapPacked: true,
    }).promise

    currentPage = 1

    if (mode === 'reader') {
      await showReaderMode(app)
    } else {
      await showPdfMode(app)
    }
  } catch {
    container.innerHTML = `
      <div class="viewer__state">
        <p data-i18n="viewer.errorLoad"></p>
        <button class="retry-btn" id="retry-btn" data-i18n="viewer.retry"></button>
      </div>
    `
    applyToDOM()
    app.querySelector('#retry-btn')?.addEventListener('click', () => loadPdf(app, pdfUrl))
  }
}

// --- メイン描画 ---

export async function renderViewer(app) {
  const htmlUrl = sessionStorage.getItem('currentHtmlUrl')
  if (!htmlUrl) {
    navigate('/')
    return
  }

  app.innerHTML = `
    <div class="viewer">
      <div class="viewer__header">
        <button class="viewer__back" id="back-btn">←</button>
        <div class="viewer__mode-toggle">
          <button class="mode-btn${mode === 'reader' ? ' active' : ''}" data-mode="reader">Reader</button>
          <button class="mode-btn${mode === 'pdf' ? ' active' : ''}" data-mode="pdf">PDF</button>
        </div>
        <span class="viewer__page-info"></span>
        <div class="viewer__lang-switcher">
          ${LANGS.map(l => `
            <button class="viewer__lang-btn${getLang() === l.code ? ' active' : ''}" data-lang="${l.code}">
              ${l.label}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="viewer__canvas-container"></div>
      <div class="viewer__footer" style="display:none">
        <button class="page-btn" id="prev-btn">&#8592;</button>
        <button class="page-btn" id="next-btn">&#8594;</button>
      </div>
    </div>
  `

  applyToDOM()

  // 戻るボタン
  app.querySelector('#back-btn').addEventListener('click', () => {
    readerBlobUrls.forEach(url => URL.revokeObjectURL(url))
    readerBlobUrls = []
    pdfDoc = null
    navigate('/scanner')
  })

  // モード切替
  app.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.mode === mode || !pdfDoc) return
      mode = btn.dataset.mode
      app.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      if (mode === 'reader') {
        await showReaderMode(app)
      } else {
        await showPdfMode(app)
      }
    })
  })

  // ページ送り（PDF Mode）
  app.querySelector('#prev-btn').addEventListener('click', () => goToPage(app, currentPage - 1))
  app.querySelector('#next-btn').addEventListener('click', () => goToPage(app, currentPage + 1))

  // 言語切替
  app.querySelectorAll('.viewer__lang-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      setLang(btn.dataset.lang)
      app.querySelectorAll('.viewer__lang-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      const pdfUrl = pickPdfUrl(urlMap, getLang())
      await loadPdf(app, pdfUrl)
    })
  })

  // HTMLをパースしてPDF URLマップを取得
  try {
    urlMap = await parsePdfUrls(htmlUrl)
  } catch {
    app.querySelector('.viewer__canvas-container').innerHTML = `
      <div class="viewer__state">
        <p data-i18n="viewer.errorLoad"></p>
        <button class="retry-btn" id="retry-btn" data-i18n="viewer.retry"></button>
      </div>
    `
    applyToDOM()
    app.querySelector('#retry-btn')?.addEventListener('click', () => renderViewer(app))
    return
  }

  sessionStorage.setItem('pdfUrlMap', JSON.stringify(urlMap))
  await loadPdf(app, pickPdfUrl(urlMap, getLang()))
}
