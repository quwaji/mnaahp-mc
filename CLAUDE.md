# CLAUDE.md

## プロジェクト概要

博物館向けモバイルWebアプリ。展示に添えられたQRコードをスキャンし、リンク先PDFをモバイル向けに表示する。

## 技術スタック

- **フレームワーク**: Vite + Vanilla JS
- **QRスキャン**: html5-qrcode
- **PDF表示**: PDF.js (pdfjs-dist)
- **多言語**: JSON定義のシンプルなi18n（EN / ES / 中文）
- **デプロイ**: Vercel

## 重要な仕様

- **デフォルト言語**: EN
- **QRコードのリンク先**: PDFではなくHTML（言語選択ページ）
- アプリがHTMLをfetch・パースしてPDF URLを取得する
- PDF は GitHub Pages でホスト（CORS: `Allow-Origin: *` のため問題なし）

## QRコードのリンク先HTML構造

```html
<a href="9(v4)-1.pdf" class="button peru">ES</a>
<a href="9(v4)-2.pdf" class="button us">EN</a>
<a href="9(v4)-3.pdf" class="button china">中文</a>
```

- リンクテキスト（ES / EN / 中文）でPDF URLを特定する
- hrefは相対パス → HTMLのベースURLと結合して絶対URLを生成

## サンプルURL

- HTML: `https://mnaahp-mc.github.io/apec/index36.html`
- PDF: `https://mnaahp-mc.github.io/apec/9(v4)-2.pdf`

## 詳細設計

`docs/design.md` を参照。
