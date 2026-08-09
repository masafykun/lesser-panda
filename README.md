# 🦝 レッサーパンダ.jp

> すきな たべものを えらぶと、それを たべている レッサーパンダが うまれます。

たべものを選ぶと、それを両手で持って食べているレッサーパンダの画像を生成する子供向けサイトです。
生成された画像はギャラリーに溜まっていきます。ログインも入力欄もありません。

![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js)
![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express)
![Cloudflare Workers AI](https://img.shields.io/badge/Cloudflare-Workers_AI-F38020?style=flat-square&logo=cloudflare)
![Nginx](https://img.shields.io/badge/Nginx-reverse_proxy-009639?style=flat-square&logo=nginx)

---

## ✨ 特徴

- **たべもの付きの画像生成** — 85 種類のたべものから選ぶと、そのたべものを持った
  レッサーパンダが生成されます（Cloudflare Workers AI / FLUX.1 [schnell]）
- **ホワイトリスト方式の入力** — たべものはサーバー側の一覧にあるものだけを受け付けます。
  英訳文もサーバー側で固定して画像プロンプトに埋め込むため、たべもの以外の指示を
  混ぜ込むことができません
- **IP ごとのレートリミット** — 20 秒のクールダウン。サーバー全体で止めると
  1 人が生成しただけで他の全員が待たされてしまうため、IP 単位にしています
- **ギャラリー表示** — 生成した画像をサーバーに保存して一覧表示。何を食べているかも表示します
- **ひらがな UI** — 子供が読めるように、画面の文字とエラーメッセージはすべてひらがな
- **レスポンシブ対応**

---

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---|---|
| バックエンド | Node.js 22 + Express 4（ESM） |
| AI画像生成 | Cloudflare Workers AI `@cf/black-forest-labs/flux-1-schnell` |
| フロントエンド | HTML / CSS / JavaScript（バニラ） |
| Webサーバー | Nginx（静的配信 + `/api/` のリバースプロキシ） |
| プロセス管理 | pm2 |

---

## 📁 ディレクトリ構成

```
lesser-panda/
├── server.js           # APIサーバー（画像生成・ギャラリー・たべもの一覧）
├── package.json
├── package-lock.json
├── frontend/
│   ├── index.html      # メインページ
│   ├── script.js       # フロントエンドロジック
│   ├── styles.css      # スタイル
│   └── images/
│       └── generated/  # 生成画像の保存先（gitignore対象）
├── .env.example
└── .gitignore
```

生成画像に対応する「何を食べているか」は `meta.json`（実行時に自動生成）に保存されます。
ファイル名からは復元できないためです。

---

## 🚀 セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/masafykun/lesser-panda.git
cd lesser-panda

# 2. 依存関係をインストール
npm install

# 3. 環境変数を設定
cp .env.example .env
# .env に Cloudflare のアカウントIDとAPIトークンを記入

# 4. 起動
npm start
```

Cloudflare の API トークンは **Workers AI の実行権限**（`Workers AI:Read`）が必要です。
ダッシュボードの「My Profile → API Tokens」から作成できます。

---

## 🔑 環境変数

| 変数名 | 説明 | 必須 | 既定値 |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID | ✅ | — |
| `CLOUDFLARE_API_TOKEN` | Workers AI を実行できる API トークン | ✅ | — |
| `PORT` | APIサーバーのポート番号 | 任意 | `3000` |
| `IMAGES_DIR` | 生成画像の保存先パス | 任意 | `frontend/images/generated` |
| `CF_IMAGE_MODEL` | 使用するモデル | 任意 | `@cf/black-forest-labs/flux-1-schnell` |
| `CF_IMAGE_STEPS` | 生成ステップ数 | 任意 | `4` |
| `DAILY_LIMIT` | 1日あたりの生成上限（サーバー全体） | 任意 | `200` |
| `RATE_LIMIT_MS` | IPごとのクールダウン（ミリ秒） | 任意 | `20000` |
| `MAX_CONCURRENT` | 同時に走らせる生成の上限 | 任意 | `3` |

Workers AI の無料枠は 10,000 Neurons/日です。flux-1-schnell の 1024x1024 は
概ね 20〜40 Neurons/枚なので、既定の `DAILY_LIMIT=200` は余裕をみた値です。

---

## 🔌 API

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/foods` | 選べるたべものの一覧（名前と絵文字） |
| `GET` | `/api/can-generate` | 生成できるか、あと何秒待つか、今日の残り |
| `GET` | `/api/gallery` | 生成済み画像の一覧（最新 50 件） |
| `POST` | `/api/generate` | 画像を生成する。`{"food": "りんご"}` |

`/api/generate` は一覧にないたべものを 400、クールダウン中と日次上限超過を 429、
同時実行数の超過を 503 で返します。

---

## 🌐 Nginx 設定例

フロントエンドを静的ファイルとして配信しつつ、`/api/` を Node.js サーバーにプロキシします。
アプリは `127.0.0.1` のみで待ち受けるため、外部から直接叩かれることはありません。

```nginx
server {
    server_name レッサーパンダ.jp;

    root /path/to/lesser-panda/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ドットファイルとバックアップの直接取得を禁止
    location ~ /\. { deny all; }
    location ~* \.(bak|old|orig|save|swp|tmp)([._-]|$) { return 404; }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

レートリミットを IP ごとに効かせるため、アプリ側は `app.set('trust proxy', 'loopback')` で
`X-Forwarded-For` を信頼しています。nginx を経由しない構成にする場合は見直してください。

---

## 📝 補足

生成画像を自動で削除する処理は入れていません。`DAILY_LIMIT` を使い切ると
1 日あたり最大 130MB ほど増える計算（1 枚 ≒ 650KB）なので、長期運用する場合は
古い画像の掃除を検討してください。

---

## ライセンス

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

このプロジェクトは **MIT ライセンス** のもとで公開しています。

© 2026 masafykun (https://github.com/masafykun)
