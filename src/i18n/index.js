import en from './en.json'
import es from './es.json'
import zh from './zh.json'

const SUPPORTED_LANGS = ['en', 'es', 'zh']
const DEFAULT_LANG = 'en'

const translations = { en, es, zh }

let currentLang = DEFAULT_LANG

function detectLang() {
  const saved = localStorage.getItem('lang')
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved

  const browser = navigator.language?.slice(0, 2).toLowerCase()
  if (browser === 'es') return 'es'
  if (browser === 'zh') return 'zh'
  return DEFAULT_LANG
}

export function init() {
  try {
    currentLang = detectLang()
  } catch {
    currentLang = DEFAULT_LANG
  }
  applyToDOM()
}

export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return
  currentLang = lang
  try {
    localStorage.setItem('lang', lang)
  } catch {
    // プライベートブラウジング等で失敗しても続行
  }
  applyToDOM()
}

export function getLang() {
  return currentLang
}

export function t(key, params = {}) {
  const keys = key.split('.')
  let value = translations[currentLang]
  for (const k of keys) {
    value = value?.[k]
  }
  if (typeof value !== 'string') return key

  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`)
}

export function applyToDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n
    el.textContent = t(key)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder)
  })
}
