/**
 * QRコードのリンク先HTMLを取得・解析してPDF URLマップを返す
 *
 * HTMLの構造（例）:
 *   <a href="9(v4)-1.pdf">ES</a>
 *   <a href="9(v4)-2.pdf">EN</a>
 *   <a href="9(v4)-3.pdf">中文</a>
 *
 * 返す形式:
 *   { EN: "https://...2.pdf", ES: "https://...1.pdf", 中文: "https://...3.pdf" }
 */
export async function parsePdfUrls(htmlUrl) {
  const res = await fetch(htmlUrl)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)

  const html = await res.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const base = new URL(htmlUrl)
  const urlMap = {}

  doc.querySelectorAll('a[href]').forEach(a => {
    const label = a.textContent.trim()
    const href = a.getAttribute('href')
    if (!label || !href) return

    // 絶対URLに解決
    const absolute = new URL(href, base).href
    urlMap[label] = absolute
  })

  if (Object.keys(urlMap).length === 0) {
    throw new Error('No PDF links found in page')
  }

  return urlMap
}

/**
 * URLマップとアプリ言語からPDF URLを取得する
 * @param {{ [label: string]: string }} urlMap
 * @param {'en'|'es'|'zh'} lang
 * @returns {string}
 */
export function pickPdfUrl(urlMap, lang) {
  const labelMap = { en: 'EN', es: 'ES', zh: '中文' }
  const label = labelMap[lang]
  const url = urlMap[label]

  if (!url) {
    // フォールバック: 最初のURLを返す
    return Object.values(urlMap)[0]
  }

  return url
}
