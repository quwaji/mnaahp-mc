# 設計書

## アプリ概要

博物館向けモバイルWebアプリ。展示に添えられたQRコードをスキャンし、リンク先PDFをスマホで読みやすく表示する。

- 対象: スマートフォン（モバイルファースト）
- 対応言語: EN（デフォルト）/ ES / 中文
- デプロイ: Vercel（静的サイト）
- GitHub: https://github.com/quwaji/mnaahp-mc

---

## ディレクトリ構成

```
mnaahp-mc/
├── public/
│   └── favicon.ico
├── src/
│   ├── main.js                 # エントリーポイント・ルーティング
│   ├── router.js               # ハッシュベースSPAルーター（#/ #/scanner #/viewer）
│   │
│   ├── i18n/
│   │   ├── index.js            # init(), t(), setLang(), applyToDOM()
│   │   ├── en.json             # 英語（デフォルト）
│   │   ├── es.json             # スペイン語
│   │   └── zh.json             # 中国語
│   │
│   ├── pages/
│   │   ├── home.js             # トップページ（説明 + 言語切替）
│   │   ├── scanner.js          # QRスキャン画面
│   │   └── viewer.js           # PDF表示画面（Reader/PDFモード切替）
│   │
│   ├── services/
│   │   ├── htmlParser.js       # QRリンク先HTMLのパース・PDF URL抽出
│   │   └── pdfExtractor.js     # PDF画像・テキスト抽出・グループ化
│   │
│   └── styles/
│       ├── main.css            # グローバルスタイル・CSS変数
│       ├── home.css
│       ├── scanner.css
│       └── viewer.css
│
├── index.html                  # SPAシェル
├── vite.config.js
├── vercel.json                 # SPAルーティング設定
├── package.json
├── CLAUDE.md
└── docs/
    └── design.md               # 本ファイル
```

---

## 画面構成と遷移

```
┌─────────────────────────────────────────┐
│                HOME                     │
│  アプリ説明                              │
│  言語切替: [EN] [ES] [中文]             │
│  [スキャン開始] ボタン                   │
└────────────────┬────────────────────────┘
                 │ タップ
                 ▼
┌─────────────────────────────────────────┐
│               SCANNER                   │
│  カメラプレビュー（全画面）              │
│  QRコード読取                           │
│  [戻る]                                 │
└────────────────┬────────────────────────┘
                 │ QR読取成功
                 ▼
┌─────────────────────────────────────────┐
│               VIEWER                    │
│  [← 戻る] [Reader|PDF] [EN][ES][中文]   │
│                                         │
│  Reader Mode（デフォルト）:             │
│    全ページ縦スクロール                  │
│    サムネイル画像＋テキスト横並びカード  │
│                                         │
│  PDF Mode:                              │
│    1ページずつ Canvas 描画              │
│    [← 前ページ] [次ページ →]           │
└─────────────────────────────────────────┘

言語切替はすべての画面で有効。
```

---

## データフロー

### QRスキャン → PDF表示

```
1. ユーザーがQRコードをスキャン
      └→ html5-qrcode が URL を返す
            例: https://mnaahp-mc.github.io/apec/index36.html

2. htmlParser.js が HTML を fetch
      └→ <a> タグのテキスト(ES / EN / 中文)と href を収集
            { "EN": "9(v4)-2.pdf", "ES": "9(v4)-1.pdf", "中文": "9(v4)-3.pdf" }

3. href を絶対 URL に解決
      EN PDF: https://mnaahp-mc.github.io/apec/9(v4)-2.pdf

4. アプリの選択言語に対応する PDF URL で PDF.js がロード

5. Reader Mode: pdfExtractor.js で各ページを処理して縦スクロール表示
   PDF Mode:    ページ単位で Canvas に描画
```

### 言語切替（Viewer 上での切替）

```
言語ボタンをタップ
  └→ i18n.setLang(lang) で UI テキストを更新
  └→ urlMap から新言語の PDF URL を取得
  └→ PDF を差し替えて再レンダリング
```

---

## QRコードのリンク先HTML構造

QRコードはPDFに直接リンクせず、言語選択HTMLページにリンクしている。

```html
<!-- 例: https://mnaahp-mc.github.io/apec/index36.html -->
<a href="9(v4)-1.pdf" class="button peru">ES</a>
<a href="9(v4)-2.pdf" class="button us">EN</a>
<a href="9(v4)-3.pdf" class="button china">中文</a>
```

**パース方針**: `<a>` タグのテキストコンテンツ（`ES` / `EN` / `中文`）でPDFを特定する。CSSクラスは使わない（変更される可能性があるため）。

---

## Reader Mode（pdfExtractor.js）

### 処理フロー

```
各ページに対して:
  1. renderFullPage()    ページ全体をoffscreen canvasに描画
  2. findImageRegions()  getOperatorList() + CTM追跡で画像のPDF座標を収集
  3. getTextContent()    テキストアイテムをY座標付きで取得
  4. 画像クロップ        PDF座標 → canvas座標に変換してcanvasから切り出し → Blob URL
  5. buildTextBlocks()   テキストを行→ブロックにグループ化（行内は流し組み）
  6. groupContent()      Y範囲オーバーラップで画像とテキストを「カード」に対応づけ
  7. 上→下の順にソートして返す
```

### フィルタリング

| 対象 | 判定条件 | 処理 |
|------|---------|------|
| ヘッダー画像 | centerY > pageHeight × 90% | 除外 |
| フッター画像 | centerY < pageHeight × 10% | 除外 |
| 装飾的な小画像 | width < 8% or height < 5% | 除外 |
| ヘッダー文字 | Y > pageHeight × 90% | 除外 |
| フッター文字 | Y < pageHeight × 10% | 除外 |

### 返却データ構造

```js
// カード（画像＋対応テキスト）
{ type: 'card', blobUrl: string, texts: string[], topY: number }

// 独立テキストセクション（画像と対応しないテキスト）
{ type: 'text', texts: string[], topY: number }
```

### Reader Mode 表示レイアウト

```
┌──────────────────────────────────┐
│ [img 25vw] テキストが右に横並び  │  ← カード
├──────────────────────────────────┤  ← 区切り線
│ [img 25vw] キャプション          │  ← カード
├──────────────────────────────────┤
│ 全体の説明テキストが流し組みで   │  ← 独立テキストセクション
│ 表示される                       │
└──────────────────────────────────┘
```

---

## i18n 設計

### JSONキー構造

```json
{
  "app": { "title": "Museum Guide" },
  "home": {
    "description": "Scan the QR code next to each exhibit.",
    "scanButton": "Scan QR Code"
  },
  "scanner": {
    "guide": "Point the camera at the QR code",
    "errorInvalidUrl": "Could not find a document in this QR code.",
    "errorCamera": "Camera access denied. Please allow camera permission."
  },
  "viewer": {
    "loading": "Loading document...",
    "page": "{{current}} / {{total}}",
    "errorLoad": "Could not load the document.",
    "retry": "Try Again",
    "back": "Back"
  }
}
```

### 言語検出の優先順位

```
1. localStorage の 'lang' キー（ユーザーが過去に選択済み）
2. navigator.language の先頭2文字
     'es' → ES, 'zh' → 中文, その他 → EN（デフォルト）
```

---

## 状態管理

```
localStorage（永続）
  'lang': 'en' | 'es' | 'zh'

sessionStorage（セッション中）
  'currentHtmlUrl': QRから取得したHTML URL
  'pdfUrlMap': { EN: "...", ES: "...", 中文: "..." }

メモリ（モジュール変数）
  pdfDoc: PDFDocumentProxy
  currentPage: number
  urlMap: { [label]: url }
  mode: 'reader' | 'pdf'
  readerBlobUrls: string[]  ← ページ離脱時に解放
```

---

## 技術的リスクと対応

| リスク | 対応 |
|--------|------|
| カメラ権限（iOS Safari） | HTTPS必須。権限拒否時は設定ガイドを表示 |
| HTML構造の変更 | CSSクラスでなくテキストコンテンツで判定 |
| PDFが大きい | Reader Mode: ページ単位処理。PDF Mode: 1ページずつ描画 |
| 中国語PDFの文字化け | PDF.js の CMap を CDN から取得 |
| プライベートブラウジング | localStorage 失敗時はデフォルト言語（EN）にフォールバック |
| 画像Blob URLのメモリリーク | モード切替・ページ離脱時に `URL.revokeObjectURL()` で解放 |

---

## 依存パッケージ

```json
{
  "dependencies": {
    "html5-qrcode": "^2.3.8",
    "pdfjs-dist": "^4.4.168"
  },
  "devDependencies": {
    "vite": "^6.3.2"
  }
}
```

---

## Vercel 設定

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 今後の拡張（Next Step）

- **日本語翻訳機能**: Reader Modeのテキストをブラウザ翻訳APIや外部翻訳APIで日本語化
- **お気に入りリスト**: スキャンしたアイテムをlocalStorageに保存・一覧表示
