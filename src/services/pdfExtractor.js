import * as pdfjsLib from 'pdfjs-dist'

const HEADER_RATIO = 0.10
const FOOTER_RATIO = 0.10

function multiplyMatrix([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) {
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ]
}

async function renderFullPage(page) {
  const naturalVp = page.getViewport({ scale: 1 })
  const renderScale = (window.innerWidth / naturalVp.width) * Math.min(window.devicePixelRatio || 1, 2)
  const viewport = page.getViewport({ scale: renderScale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

  return { canvas, renderScale, pageWidth: naturalVp.width, pageHeight: naturalVp.height }
}

async function findImageRegions(page) {
  const ops = await page.getOperatorList()
  const OPS = pdfjsLib.OPS

  const stateStack = []
  let ctm = [1, 0, 0, 1, 0, 0]
  const regions = []
  const seenNames = new Set()

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i]

    if (fn === OPS.save) {
      stateStack.push([...ctm])
    } else if (fn === OPS.restore) {
      if (stateStack.length) ctm = stateStack.pop()
    } else if (fn === OPS.transform) {
      ctm = multiplyMatrix(ctm, args)
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const name = args[0]
      if (seenNames.has(name)) continue
      seenNames.add(name)

      const w = Math.sqrt(ctm[0] ** 2 + ctm[1] ** 2)
      const h = Math.sqrt(ctm[2] ** 2 + ctm[3] ** 2)
      const x = ctm[4]
      const y = ctm[5]  // PDF Y（下が原点）

      regions.push({ x, y, w, h, name })
    }
  }

  return regions
}

/**
 * テキストアイテムを行→ブロックにグループ化する
 * 各ブロックは { content, topY, bottomY } を持つ
 * topY > bottomY（PDF座標系: 上の方がY値が大きい）
 */
function buildTextBlocks(items) {
  if (!items.length) return []

  const sorted = [...items].sort((a, b) => b.y - a.y)

  // 行にグループ化
  const lines = []
  let currentLine = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], curr = sorted[i]
    const fs = (prev.fontSize + curr.fontSize) / 2
    if (Math.abs(prev.y - curr.y) < fs * 0.6) {
      currentLine.push(curr)
    } else {
      lines.push(currentLine)
      currentLine = [curr]
    }
  }
  lines.push(currentLine)

  // 行間が大きければ別ブロックに分割
  const lineGroups = []
  let currentGroup = [lines[0]]
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1][0].y - lines[i][0].y
    const fs = lines[i - 1][0].fontSize || 10
    if (gap > fs * 2.0) {
      lineGroups.push(currentGroup)
      currentGroup = [lines[i]]
    } else {
      currentGroup.push(lines[i])
    }
  }
  lineGroups.push(currentGroup)

  return lineGroups.map(group => {
    const topY = group[0][0].y           // 最初の行のY（PDFのY軸で最大 = 上）
    const bottomY = group[group.length - 1][0].y  // 最後の行のY
    // 各行を左→右でソートして結合し、行間のスペースで一続きのテキストにする
    const content = group
      .map(line => [...line].sort((a, b) => a.x - b.x).map(i => i.text).join(' ').trim())
      .filter(Boolean)
      .join(' ')
    return { content, topY, bottomY }
  }).filter(b => b.content.trim() !== '')
}

/**
 * 画像とテキストブロックをY範囲のオーバーラップで対応づけ、
 * カード（画像+テキスト）または独立テキストセクションにグループ化する
 */
function groupContent(imageItems, textBlocks) {
  const usedTextIndices = new Set()
  const cards = []

  // 画像を上→下の順に処理
  for (const img of [...imageItems].sort((a, b) => b.topY - a.topY)) {
    // Y範囲がオーバーラップするテキストブロックを探す
    const paired = textBlocks
      .map((block, idx) => ({ block, idx }))
      .filter(({ block, idx }) => {
        if (usedTextIndices.has(idx)) return false
        // 画像のY範囲 [img.bottomY, img.topY] とブロックのY範囲が重なるか
        return block.topY > img.bottomY && block.bottomY < img.topY
      })

    paired.forEach(({ idx }) => usedTextIndices.add(idx))

    cards.push({
      type: 'card',
      blobUrl: img.blobUrl,
      texts: paired.map(({ block }) => block.content),
      topY: img.topY,
    })
  }

  // 画像と対応しなかった独立テキストセクション
  const standaloneTexts = textBlocks
    .filter((_, idx) => !usedTextIndices.has(idx))
    .map(block => ({
      type: 'text',
      texts: [block.content],
      topY: block.topY,
    }))

  return [...cards, ...standaloneTexts].sort((a, b) => b.topY - a.topY)
}

/**
 * ページのコンテンツを抽出してグループ化した形で返す
 * @returns {Array<{type:'card',blobUrl,texts[]}|{type:'text',texts[]}>}
 */
export async function extractPageContent(page) {
  const naturalVp = page.getViewport({ scale: 1 })
  const pageHeight = naturalVp.height
  const pageWidth = naturalVp.width

  const headerY = pageHeight * (1 - HEADER_RATIO)
  const footerY = pageHeight * FOOTER_RATIO
  const minW = pageWidth * 0.08
  const minH = pageHeight * 0.05

  const [{ canvas, renderScale }, regions, textContent] = await Promise.all([
    renderFullPage(page),
    findImageRegions(page),
    page.getTextContent(),
  ])

  // --- 画像アイテムの生成 ---
  const imageItems = []
  for (const region of regions) {
    const centerY = region.y + region.h / 2
    const topY = region.y + region.h
    const bottomY = region.y

    if (centerY > headerY) continue
    if (centerY < footerY) continue
    if (region.w < minW || region.h < minH) continue

    const cx = region.x * renderScale
    const cy = (pageHeight - region.y - region.h) * renderScale
    const cw = region.w * renderScale
    const ch = region.h * renderScale

    if (cx < 0 || cy < 0 || cx + cw > canvas.width || cy + ch > canvas.height) continue

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = Math.round(cw)
    cropCanvas.height = Math.round(ch)
    cropCanvas.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)

    const blobUrl = await new Promise(resolve => {
      cropCanvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.9)
    })

    if (blobUrl) imageItems.push({ blobUrl, topY, bottomY, centerY })
  }

  // --- テキストブロックの生成 ---
  const rawTextItems = textContent.items
    .filter(item => item.str.trim() !== '')
    .filter(item => {
      const y = item.transform[5]
      return y > footerY && y < headerY
    })
    .map(item => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      fontSize: Math.abs(item.transform[3]) || item.height || 10,
    }))

  const textBlocks = buildTextBlocks(rawTextItems)

  return groupContent(imageItems, textBlocks)
}
