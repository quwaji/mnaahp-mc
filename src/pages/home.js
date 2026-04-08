import { t, getLang, setLang, applyToDOM } from '../i18n/index.js'
import { navigate } from '../router.js'

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'zh', label: '中文' },
]

export function renderHome(app) {
  app.innerHTML = `
    <div class="home">
      <h1 class="home__title" data-i18n="app.title"></h1>
      <p class="home__description" data-i18n="home.description"></p>
      <div class="lang-switcher">
        ${LANGS.map(l => `
          <button class="lang-btn${getLang() === l.code ? ' active' : ''}" data-lang="${l.code}">
            ${l.label}
          </button>
        `).join('')}
      </div>
      <button class="scan-btn" id="scan-btn" data-i18n="home.scanButton"></button>
    </div>
  `

  applyToDOM()

  app.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang)
      app.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  app.querySelector('#scan-btn').addEventListener('click', () => {
    navigate('/scanner')
  })
}
