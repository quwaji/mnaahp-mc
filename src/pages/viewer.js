import * as pdfjsLib from 'pdfjs-dist'
import { t, getLang, setLang, applyToDOM } from '../i18n/index.js'
import { navigate } from '../router.js'
import { parsePdfUrls, pickPdfUrl } from '../services/htmlParser.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'zh', label: '中文' },
]

let pdfDoc = null
let currentPage = 1
let urlMap = {}

async function renderPage(container, pageNum) {
  const page = await pdfDoc.getPage(pageNum)
  const scale = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: (container.clientWidth / page.getViewport({ scale: 1 }).width) * scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.width = `${viewport.width / scale}px`
  canvas.style.height = `${viewport.height / scale}px`

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas
}

async function loadAndRender(app, pdfUrl) {
  const container = app.querySelector('.viewer__canvas-container')
  const footer = app.querySelector('.viewer__footer')
  const pageInfo = app.querySelector('.viewer__page-info')

  container.innerHTML = `<div class="viewer__state"><p data-i18n="viewer.loading"></p></div>`
  applyToDOM()
  if (footer) footer.style.display = 'none'

  try {
    pdfDoc = await pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/cmaps/',
      cMapPacked: true,
    }).promise

    currentPage = 1
    container.innerHTML = ''
    if (footer) footer.style.display = 'flex'
    updateFooter(app)

    const canvas = await renderPage(container, currentPage)
    container.appendChild(canvas)
  } catch {
    container.innerHTML = `
      <div class="viewer__state">
        <p data-i18n="viewer.errorLoad"></p>
        <button class="retry-btn" id="retry-btn" data-i18n="viewer.retry"></button>
      </div>
    `
    applyToDOM()
    app.querySelector('#retry-btn')?.addEventListener('click', () => loadAndRender(app, pdfUrl))
  }
}

function updateFooter(app) {
  const prevBtn = app.querySelector('#prev-btn')
  const nextBtn = app.querySelector('#next-btn')
  const pageInfo = app.querySelector('.viewer__page-info')

  if (!pdfDoc) return
  prevBtn.disabled = currentPage <= 1
  nextBtn.disabled = currentPage >= pdfDoc.numPages
  pageInfo.textContent = t('viewer.page', { current: currentPage, total: pdfDoc.numPages })
}

async function goToPage(app, pageNum) {
  if (!pdfDoc || pageNum < 1 || pageNum > pdfDoc.numPages) return
  currentPage = pageNum

  const container = app.querySelector('.viewer__canvas-container')
  container.innerHTML = ''
  const canvas = await renderPage(container, currentPage)
  container.appendChild(canvas)
  container.scrollTo(0, 0)
  updateFooter(app)
}

export async function renderViewer(app) {
  const htmlUrl = sessionStorage.getItem('currentHtmlUrl')
  if (!htmlUrl) {
    navigate('/')
    return
  }

  app.innerHTML = `
    <div class="viewer">
      <div class="viewer__header">
        <button class="viewer__back" id="back-btn">← <span data-i18n="viewer.back"></span></button>
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

  app.querySelector('#back-btn').addEventListener('click', () => {
    pdfDoc = null
    navigate('/scanner')
  })

  app.querySelector('#prev-btn').addEventListener('click', () => goToPage(app, currentPage - 1))
  app.querySelector('#next-btn').addEventListener('click', () => goToPage(app, currentPage + 1))

  app.querySelectorAll('.viewer__lang-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      setLang(btn.dataset.lang)
      app.querySelectorAll('.viewer__lang-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      const pdfUrl = pickPdfUrl(urlMap, getLang())
      await loadAndRender(app, pdfUrl)
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
  const pdfUrl = pickPdfUrl(urlMap, getLang())
  await loadAndRender(app, pdfUrl)
}
