# 🦝 レッサーパンダ.jp

> AIがつくりだす、たったひとつだけのレッサーパンダ。

DALL·E 3 を使ってレッサーパンダの画像をリアルタイム生成するWebサイトです。
ボタンを押すだけで世界に一枚だけのレッサーパンダが生まれ、ギャラリーに蓄積されていきます。

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js)
![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express)
![OpenAI](https://img.shields.io/badge/OpenAI-DALL·E_3-412991?style=flat-square&logo=openai)
![Nginx](https://img.shields.io/badge/Nginx-reverse_proxy-009639?style=flat-square&logo=nginx)

---

## ✨ 特徴

- **AIによる画像生成** — OpenAI DALL·E 3（HD品質）でレッサーパンダを自動生成
- **ギャラリー表示** — 生成した画像をサーバーに保存して一覧表示
- **ライトボックス** — 画像クリックで拡大表示
- **レートリミット** — 連続生成を防ぐ60秒クールダウン（サーバー・クライアント両側で管理）
- **パーティクル背景 & コンフェッティ** — 生成完了時の演出
- **レスポンシブ対応** — スマホ・タブレットでも快適に動作

---

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---|---|
| バックエンド | Node.js + Express |
| AI画像生成 | OpenAI DALL·E 3 |
| フロントエンド | HTML / CSS / JavaScript（バニラ） |
| Webサーバー | Nginx（リバースプロキシ） |

---

## 📁 ディレクトリ構成

```
lesser-panda/
├── api/
│   ├── server.js        # APIサーバー（画像生成・ギャラリー）
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── index.html       # メインページ
│   ├── script.js        # フロントエンドロジック
│   ├── styles.css       # スタイル
│   └── images/
│       └── generated/   # AI生成画像の保存先（gitignore対象）
├── .env.example
└── .gitignore
```

---

## 🚀 セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/masafykun/lesser-panda.git
cd lesser-panda

# 2. 依存関係をインストール
cd api && npm install

# 3. 環境変数を設定
cp ../.env.example .env
# .env に OpenAI API キーを記入
```

---

## 🔑 環境変数

`.env.example` をコピーして `.env` を作成し、必要なキーを設定してください。

| 変数名 | 説明 | 必須 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI の API キー（DALL·E 3 の利用に必要） | ✅ |
| `PORT` | APIサーバーのポート番号（デフォルト: `3000`） | 任意 |
| `IMAGES_DIR` | 生成画像の保存先パス（デフォルト: `../frontend/images/generated`） | 任意 |

---

## 🌐 Nginx 設定例

フロントエンドを静的ファイルとして配信しつつ、`/api/` をNode.jsサーバーにプロキシします。

```nginx
server {
    server_name レッサーパンダ.jp;

    root /path/to/lesser-panda/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

---

## ライセンス

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

このプロジェクトは **MIT ライセンス** のもとで公開しています。

© 2026 masafykun (https://github.com/masafykun)
