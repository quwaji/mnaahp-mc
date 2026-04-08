import * as pdfjsLib from 'pdfjs-dist'

const HEADER_RATIO = 0.10  // 上10%をヘッダーとして除外
const FOOTER_RATIO = 0.10  // 下10%をフッターとして除外

// 6要素アフィン行列の掛け算
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

/**
 * ページをcanvasに描画し、canvasとスケールを返す
 */
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

/**
 * getOperatorList + CTM追跡で、ページ内の画像の位置とサイズを収集する
 * 返す座標はPDF座標系（Y軸: 下が原点）
 */
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
      if (seenNames.has(name)) continue  // 同一XObjectの重複スキップ
      seenNames.add(name)

      // 画像はunit square [0,1]×[0,1] をCTMで変換して描画される
      // w, h は回転を考慮して sqrt で計算
      const w = Math.sqrt(ctm[0] ** 2 + ctm[1] ** 2)
      const h = Math.sqrt(ctm[2] ** 2 + ctm[3] ** 2)
      const x = ctm[4]        // PDF X（左端）
      const y = ctm[5]        // PDF Y（下端、Y軸は下が原点）
      const centerY = y + h / 2

      regions.push({ x, y, w, h, centerY, name })
    }
  }

  return regions
}

/**
 * ページ内のコンテンツ（画像・テキスト）を抽出し、読み順（上→下）でソートして返す
 * @returns {Array<{type:'image',blobUrl:string,centerY:number}|{type:'text',content:string,centerY:number}>}
 */
export async function extractPageContent(page) {
  const naturalVp = page.getViewport({ scale: 1 })
  const pageHeight = naturalVp.height
  const pageWidth = naturalVp.width

  const headerY = pageHeight * (1 - HEADER_RATIO)  // これより高いPDF Y = ヘッダー領域
  const footerY = pageHeight * FOOTER_RATIO          // これより低いPDF Y = フッター領域
  const minW = pageWidth * 0.08
  const minH = pageHeight * 0.05

  // ページ描画・画像位置収集・テキスト抽出を並行して実行
  const [{ canvas, renderScale }, regions, textContent] = await Promise.all([
    renderFullPage(page),
    findImageRegions(page),
    page.getTextContent(),
  ])

  // --- 画像アイテムの生成 ---
  const imageItems = []
  for (const region of regions) {
    const centerY = region.y + region.h / 2

    // ヘッダー・フッター・小さすぎる画像を除外
    if (centerY > headerY) continue
    if (centerY < footerY) continue
    if (region.w < minW || region.h < minH) continue

    // PDF座標 → canvas座標に変換してクロップ
    // PDF Y軸（下が0）→ canvas Y軸（上が0）: canvasY = (pageHeight - pdfY - imgH) * scale
    const cx = region.x * renderScale
    const cy = (pageHeight - region.y - region.h) * renderScale
    const cw = region.w * renderScale
    const ch = region.h * renderScale

    // 範囲チェック（canvasの外へはみ出していないか）
    if (cx < 0 || cy < 0 || cx + cw > canvas.width || cy + ch > canvas.height) continue

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = Math.round(cw)
    cropCanvas.height = Math.round(ch)
    cropCanvas.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)

    const blobUrl = await new Promise(resolve => {
      cropCanvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.9)
    })

    if (blobUrl) imageItems.push({ type: 'image', blobUrl, centerY })
  }

  // --- テキストアイテムの生成 ---
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

  const textItems = buildTextBlocks(rawTextItems)

  // --- 画像とテキストを上→下の順に結合 ---
  // 同じcenterYの場合は画像を先に表示（左:画像・右:テキストのレイアウト対応）
  return [...imageItems, ...textItems].sort((a, b) => {
    const diff = b.centerY - a.centerY
    if (Math.abs(diff) < 5) return a.type === 'image' ? -1 : 1  // ほぼ同Y: 画像優先
    return diff
  })
}

/**
 * テキストアイテムを行→ブロックにグループ化する
 */
function buildTextBlocks(items) {
  if (!items.length) return []

  // Y降順ソート（PDFのY軸は下が原点なので、大きいほど上）
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
  const blocks = []
  let currentBlock = [lines[0]]
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1][0].y - lines[i][0].y
    const fs = lines[i - 1][0].fontSize || 10
    if (gap > fs * 2.0) {
      blocks.push(currentBlock)
      currentBlock = [lines[i]]
    } else {
      currentBlock.push(lines[i])
    }
  }
  blocks.push(currentBlock)

  return blocks.map(block => {
    const topY = block[0][0].y
    const bottomY = block[block.length - 1][0].y
    const centerY = (topY + bottomY) / 2
    const content = block
      .map(line => [...line].sort((a, b) => a.x - b.x).map(i => i.text).join(' ').trim())
      .filter(Boolean)
      .join('\n')
    return { type: 'text', content, centerY }
  }).filter(b => b.content.trim() !== '')
}
