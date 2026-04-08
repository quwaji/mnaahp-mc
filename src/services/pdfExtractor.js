/**
 * PDFから各ページのビジュアル（画像）とテキストを抽出する
 */

const HEADER_RATIO = 0.10  // 上10%をヘッダーとして除外
const FOOTER_RATIO = 0.10  // 下10%をフッターとして除外
const LINE_GAP_THRESHOLD = 1.5  // 行間がフォントサイズの何倍以上なら段落区切りとみなすか

/**
 * 1ページ分のコンテンツを抽出する
 * @returns {{ imageUrl: string, paragraphs: string[] }}
 */
export async function extractPageContent(page) {
  const [imageUrl, paragraphs] = await Promise.all([
    renderPageToImageUrl(page),
    extractParagraphs(page),
  ])
  return { imageUrl, paragraphs }
}

/**
 * ページをcanvasに描画してBlob URLを返す
 */
async function renderPageToImageUrl(page) {
  const scale = Math.min(window.devicePixelRatio || 1, 2)
  const viewport = page.getViewport({ scale: window.innerWidth / page.getViewport({ scale: 1 }).width * scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

  return new Promise(resolve => canvas.toBlob(blob => resolve(URL.createObjectURL(blob)), 'image/jpeg', 0.85))
}

/**
 * ページからテキストを抽出し、ヘッダー/フッターを除外して段落に整形する
 */
async function extractParagraphs(page) {
  const viewport = page.getViewport({ scale: 1 })
  const pageHeight = viewport.height

  const content = await page.getTextContent()

  // ヘッダー・フッター領域を除外
  // PDF座標は下が原点なので、フッターはy < footerCutoff、ヘッダーはy > headerCutoff
  const footerCutoff = pageHeight * FOOTER_RATIO
  const headerCutoff = pageHeight * (1 - HEADER_RATIO)

  const items = content.items
    .filter(item => item.str.trim() !== '')
    .filter(item => {
      const y = item.transform[5]
      return y > footerCutoff && y < headerCutoff
    })
    .map(item => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],  // PDF座標（下原点）
      fontSize: Math.abs(item.transform[3]) || item.height,
    }))

  if (items.length === 0) return []

  // Y座標で降順ソート（PDF座標は下原点なので大きいほど上）
  items.sort((a, b) => b.y - a.y)

  // 行にグループ化（近いY座標のアイテムを同じ行とみなす）
  const lines = []
  let currentLine = [items[0]]

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]
    const curr = items[i]
    const avgFontSize = (prev.fontSize + curr.fontSize) / 2 || 10

    if (Math.abs(prev.y - curr.y) < avgFontSize * 0.5) {
      // 同じ行
      currentLine.push(curr)
    } else {
      lines.push(currentLine)
      currentLine = [curr]
    }
  }
  lines.push(currentLine)

  // 行内をX座標でソートしてテキストを結合
  const lineTexts = lines.map(line => {
    line.sort((a, b) => a.x - b.x)
    return line.map(item => item.text).join(' ').trim()
  }).filter(t => t !== '')

  // 段落にグループ化（行間が大きければ段落区切り）
  const paragraphs = []
  let currentPara = [lineTexts[0]]

  for (let i = 1; i < lineTexts.length; i++) {
    const prevLine = lines[i - 1]
    const currLine = lines[i]
    const prevY = prevLine[0].y
    const currY = currLine[0].y
    const avgFontSize = prevLine[0].fontSize || 10
    const gap = prevY - currY

    if (gap > avgFontSize * LINE_GAP_THRESHOLD) {
      paragraphs.push(currentPara.join(' '))
      currentPara = [lineTexts[i]]
    } else {
      currentPara.push(lineTexts[i])
    }
  }
  paragraphs.push(currentPara.join(' '))

  return paragraphs.filter(p => p.trim() !== '')
}
