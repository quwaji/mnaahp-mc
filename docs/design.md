# 設計書

## アプリ概要

博物館向けモバイルWebアプリ。展示に添えられたQRコードをスキャンし、リンク先PDFをスマホで読みやすく表示する。

- 対象: スマートフォン（モバイルファースト）
- 対応言語: EN（デフォルト）/ ES / 中文
- デプロイ: Vercel（静的サイト）

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
│   │   └── viewer.js           # PDF表示画面
│   │
│   ├── components/
│   │   └── langSwitcher.js     # 言語切替UIコンポーネント
│   │
│   ├── services/
│   │   ├── qrService.js        # html5-qrcode ラッパー
│   │   ├── pdfService.js       # PDF.js ラッパー
│   │   └── htmlParser.js       # QRリンク先HTMLのパース・PDF URL抽出
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
┌─────────────────────────────┐
│         HOME                │
│  アプリ説明                  │
│  言語切替: [EN] [ES] [中文]  │
│  [スキャン開始] ボタン        │
└────────────┬────────────────┘
             │ タップ
             ▼
┌─────────────────────────────┐
│         SCANNER             │
│  カメラプレビュー            │
│  QRコード読取               │
│  [戻る]                     │
└────────────┬────────────────┘
             │ QR読取成功
             ▼
┌─────────────────────────────┐
│         VIEWER              │
│  ローディング → PDF表示      │
│  ページ送り（前/次）         │
│  言語切替（即時PDFを切替）   │
│  [スキャンに戻る]            │
└─────────────────────────────┘

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
            {
              "EN": "9(v4)-2.pdf",
              "ES": "9(v4)-1.pdf",
              "中文": "9(v4)-3.pdf"
            }

3. href を絶対 URL に解決
      ベース: https://mnaahp-mc.github.io/apec/
      EN PDF: https://mnaahp-mc.github.io/apec/9(v4)-2.pdf

4. アプリの選択言語に対応する PDF URL を sessionStorage に保存

5. PDF.js で PDF をロード・表示
```

### 言語切替（Viewer 上での切替）

```
言語ボタンをタップ
  └→ i18n.setLang(lang) で UI テキストを更新
  └→ htmlParser が保持している URL マップから新言語の PDF URL を取得
  └→ pdfService.load(newUrl) で PDF を差し替え
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
    "page": "Page {{current}} of {{total}}",
    "errorLoad": "Could not load the document.",
    "retry": "Try Again",
    "back": "Back to Scanner"
  }
}
```

### 言語検出の優先順位

```
1. localStorage の 'lang' キー（ユーザーが過去に選択済み）
2. navigator.language の先頭2文字
     'es' → ES, 'zh' → 中文, その他 → EN（デフォルト）
```

### DOM 適用

- 静的要素: `data-i18n="key"` 属性 → `applyToDOM()` が一括更新
- 動的要素: `t('key', { current, total })` をJS内で直接呼び出し

---

## 状態管理

```
localStorage（永続）
  'lang': 'en' | 'es' | 'zh'

sessionStorage（セッション中）
  'currentHtmlUrl': QRから取得したHTML URL
  'pdfUrlMap': { EN: "...", ES: "...", 中文: "..." }  ← パース結果

メモリ（モジュール変数）
  PDFDocumentProxy オブジェクト
  現在ページ番号
```

---

## 技術的リスクと対応

| リスク | 対応 |
|--------|------|
| カメラ権限（iOS Safari） | HTTPS必須。権限拒否時は設定ガイドを表示 |
| HTML構造の変更 | テキストでなくCSSクラスに依存すると壊れる → テキスト判定を採用 |
| PDFが大きい | ページ単位レンダリング + プログレス表示 |
| 中国語PDFの文字化け | PDF.js の CMap を CDN から取得 |
| プライベートブラウジング | localStorage 失敗時はデフォルト言語（EN）にフォールバック |

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

SPAのハッシュルーターはサーバー設定不要だが、念のため `vercel.json` を置く。

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 今後の拡張（Next Step）

- PDF のテキスト・画像を抽出してモバイル向けに再レイアウト表示
  - PDF.js の `getTextContent()` でテキスト抽出
  - Canvas からの画像抽出
  - 縦スクロール形式のリーダーUIに変換
