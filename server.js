import express from 'express';
import dotenv from 'dotenv';
import { join } from 'path';
import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = process.env.IMAGES_DIR || join(import.meta.dirname, 'frontend', 'images', 'generated');
// 画像ディレクトリは nginx がそのまま配信するので、メタデータはアプリ側に置く
const META_FILE = process.env.META_FILE || join(import.meta.dirname, 'meta.json');

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_MODEL = process.env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
const CF_STEPS = Number(process.env.CF_IMAGE_STEPS || 4);

// Workers AI の無料枠は 10,000 Neurons/日。flux-1-schnell の 1024x1024 は
// 概ね 20〜40 Neurons/枚なので、余裕をみて 1 日 200 枚で頭打ちにする。
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 200);
// クールダウンは「サーバー全体」ではなく「IPごと」。全体で止めると
// 誰か1人が生成しただけで他の全員が待たされてしまう。
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 20_000);
// 同時に走らせる生成数の上限（Workers AI への同時接続を抑える）
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 3);

// 公開エンドポイントなので、たべものは「ここに載っているものだけ」を受け付ける
// ホワイトリスト方式にする。自由入力を許すと、たべもの以外の指示を画像プロンプトに
// 混ぜ込めてしまうため（例: 人物の指定）、英訳文もこちらで固定して渡す。
const FOODS = [
  // くだもの
  ['りんご', '🍎', 'a red apple'],
  ['バナナ', '🍌', 'a banana'],
  ['いちご', '🍓', 'strawberries'],
  ['ぶどう', '🍇', 'a bunch of grapes'],
  ['みかん', '🍊', 'a mandarin orange'],
  ['もも', '🍑', 'a peach'],
  ['すいか', '🍉', 'a slice of watermelon'],
  ['メロン', '🍈', 'a slice of melon'],
  ['さくらんぼ', '🍒', 'cherries'],
  ['なし', '🍐', 'a pear'],
  ['かき', '🧡', 'a persimmon'],
  ['パイナップル', '🍍', 'a pineapple'],
  ['キウイ', '🥝', 'a kiwi fruit'],
  ['レモン', '🍋', 'a lemon'],
  ['マンゴー', '🥭', 'a mango'],
  ['ブルーベリー', '🫐', 'blueberries'],
  ['くり', '🌰', 'a chestnut'],
  ['どんぐり', '🌰', 'an acorn'],
  // やさい
  ['とうもろこし', '🌽', 'an ear of corn'],
  ['にんじん', '🥕', 'a carrot'],
  ['きゅうり', '🥒', 'a cucumber'],
  ['トマト', '🍅', 'a tomato'],
  ['さつまいも', '🍠', 'a roasted sweet potato'],
  ['じゃがいも', '🥔', 'a potato'],
  ['かぼちゃ', '🎃', 'a pumpkin'],
  ['なす', '🍆', 'fresh eggplants'],
  ['ピーマン', '🫑', 'a green bell pepper'],
  ['ブロッコリー', '🥦', 'broccoli'],
  ['キャベツ', '🥬', 'a cabbage leaf'],
  ['たけのこ', '🎋', 'a bamboo shoot'],
  ['ささ', '🎍', 'bamboo leaves'],
  ['きのこ', '🍄', 'a mushroom'],
  ['えだまめ', '🫛', 'edamame soybeans'],
  // ごはん
  ['ラーメン', '🍜', 'a bowl of ramen'],
  ['うどん', '🍲', 'a bowl of udon noodles'],
  ['そば', '🍜', 'a bowl of soba noodles'],
  ['やきそば', '🍝', 'yakisoba fried noodles'],
  ['スパゲッティ', '🍝', 'a plate of spaghetti'],
  ['すし', '🍣', 'sushi'],
  ['おにぎり', '🍙', 'a rice ball onigiri'],
  ['カレー', '🍛', 'a plate of curry rice'],
  ['オムライス', '🍳', 'omurice omelette rice'],
  ['ぎょうざ', '🥟', 'gyoza dumplings'],
  ['たこやき', '🐙', 'takoyaki octopus balls'],
  ['おこのみやき', '🥞', 'okonomiyaki savory pancake'],
  ['ピザ', '🍕', 'a slice of pizza'],
  ['ハンバーガー', '🍔', 'a hamburger'],
  ['ホットドッグ', '🌭', 'a hot dog'],
  ['サンドイッチ', '🥪', 'a sandwich'],
  ['からあげ', '🍗', 'japanese fried chicken karaage'],
  ['ステーキ', '🥩', 'a steak'],
  ['ポテト', '🍟', 'french fries'],
  ['パン', '🍞', 'a loaf of bread'],
  ['クロワッサン', '🥐', 'a croissant'],
  ['たまご', '🥚', 'a boiled egg'],
  ['さかな', '🐟', 'a fish'],
  ['えび', '🦐', 'a shrimp'],
  ['タコ', '🐙', 'an octopus'],
  ['チーズ', '🧀', 'a wedge of cheese'],
  ['スープ', '🥣', 'a bowl of soup'],
  ['サラダ', '🥗', 'a fresh salad'],
  // おかし
  ['ケーキ', '🍰', 'a slice of cake'],
  ['ショートケーキ', '🍰', 'a strawberry shortcake'],
  ['ホットケーキ', '🥞', 'a stack of pancakes'],
  ['プリン', '🍮', 'a custard pudding'],
  ['アイス', '🍦', 'an ice cream cone'],
  ['かきごおり', '🍧', 'a bowl of shaved ice'],
  ['ドーナツ', '🍩', 'a donut'],
  ['クッキー', '🍪', 'a cookie'],
  ['チョコ', '🍫', 'a chocolate bar'],
  ['キャンディ', '🍬', 'a candy'],
  ['ロリポップ', '🍭', 'a lollipop'],
  ['たいやき', '🐟', 'a taiyaki fish shaped cake'],
  ['だんご', '🍡', 'dango rice dumplings on a stick'],
  ['もち', '🍡', 'a rice cake mochi'],
  ['せんべい', '🍘', 'a rice cracker'],
  ['わたあめ', '☁️', 'cotton candy'],
  ['ポップコーン', '🍿', 'popcorn'],
  ['マカロン', '🍬', 'a colorful macaron'],
  ['パフェ', '🍨', 'a tall parfait'],
  // のみもの・その他
  ['はちみつ', '🍯', 'a jar of honey'],
  ['ヨーグルト', '🥛', 'a cup of yogurt'],
  ['ミルク', '🥛', 'a bottle of milk'],
  ['ジュース', '🧃', 'a juice box'],
  ['おちゃ', '🍵', 'a cup of green tea'],
];

const FOOD_DICTIONARY = new Map(FOODS.map(([name, , en]) => [name, en]));
const FOOD_LIST = FOODS.map(([name, emoji]) => ({ name, emoji }));

const PROMPT_BASE =
  'A cute and adorable red panda (lesser panda) sitting on a tree branch in a natural forest habitat. ' +
  'The red panda has fluffy reddish-brown fur, a long striped tail, and an endearing expression. ';
const PROMPT_TAIL =
  'Photorealistic style, high quality, detailed fur texture, natural lighting, beautiful bokeh background with green leaves.';

mkdirSync(IMAGES_DIR, { recursive: true });

const ipLastGeneration = new Map();
let inFlight = 0;
let imageGallery = [];
let imageMeta = {};
let dailyCount = 0;
let dailyKey = '';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function rollDailyCounter() {
  const key = todayKey();
  if (key !== dailyKey) {
    dailyKey = key;
    dailyCount = 0;
  }
}

// クールダウンを過ぎた IP は捨てる（Map が無限に育たないように）
function pruneIpTable(now) {
  if (ipLastGeneration.size < 2000) return;
  for (const [ip, at] of ipLastGeneration) {
    if (now - at >= RATE_LIMIT_MS) ipLastGeneration.delete(ip);
  }
}

function cooldownFor(ip, now) {
  const last = ipLastGeneration.get(ip) || 0;
  const elapsed = now - last;
  return elapsed >= RATE_LIMIT_MS ? 0 : Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
}

// カタカナで来ても辞書に当てられるようにひらがなへ寄せる
function toHiragana(str) {
  return str.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// ホワイトリストに一致しないものは受け付けない。前段でカタカナ／ひらがなの
// 揺れだけ吸収する（「りんご」「リンゴ」はどちらも通す）。
function normalizeFood(raw) {
  if (raw === undefined || raw === null || raw === '') return { food: '', foodEn: '' };
  if (typeof raw !== 'string') throw new Error('food must be a string');

  const input = raw.trim();
  if (!input) return { food: '', foodEn: '' };

  if (FOOD_DICTIONARY.has(input)) return { food: input, foodEn: FOOD_DICTIONARY.get(input) };

  const kana = toHiragana(input);
  for (const [name, en] of FOOD_DICTIONARY) {
    if (toHiragana(name) === kana) return { food: name, foodEn: en };
  }

  throw new Error('food is not in the allowed list');
}

// ⚠️ Cloudflare の NSFW 判定は食べもの名と言い回しの組み合わせで誤検知する。
//    実測（2026-08-24）:
//      「holding it in both front paws」→ きゅうり・バナナが弾かれる
//      「eating」を含む言い回し全般      → なす・ホットドッグが弾かれる
//    そこで段階的に無難な文面へ落とす。0 が一番絵として良く、後ろほど安全。
const PROMPT_VARIANTS = [
  (foodEn) =>
    `It is happily eating ${foodEn}, its front paws resting on it. The ${foodEn} is clearly visible and in focus. `,
  (foodEn) =>
    `${foodEn.charAt(0).toUpperCase() + foodEn.slice(1)} is placed beside it, clearly visible and in focus. `,
  // 最後の手段。食べものを出さずにパンダだけ描く。絵としては物足りないが、
  // 「つくれませんでした」で終わるよりはよい。
  () => 'It looks happily at the camera. ',
];

function buildPrompt(foodEn, variant = 0) {
  if (!foodEn) return PROMPT_BASE + PROMPT_TAIL;
  const make = PROMPT_VARIANTS[Math.min(variant, PROMPT_VARIANTS.length - 1)];
  return PROMPT_BASE + make(foodEn) + PROMPT_TAIL;
}

// NSFW 判定で弾かれたかどうか（Workers AI のエラーコード 8007）
function isNsfwRejection(err) {
  return /8007|NSFW/i.test(String(err && err.message));
}

// 拡張子はモデルの出力次第で変わるのでマジックバイトから判定する
function detectExtension(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return 'bin';
}

// 「何を食べているか」はファイル名から復元できないので、脇の meta.json に持たせる
function loadMeta() {
  try {
    if (existsSync(META_FILE)) imageMeta = JSON.parse(readFileSync(META_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to read meta.json:', err);
    imageMeta = {};
  }
}

function saveMeta() {
  try {
    writeFileSync(META_FILE, JSON.stringify(imageMeta, null, 2));
  } catch (err) {
    console.error('Failed to write meta.json:', err);
  }
}

function loadGalleryFromDisk() {
  try {
    const files = readdirSync(IMAGES_DIR)
      .filter(f => /^panda_\d+\.(png|jpe?g|webp)$/.test(f))
      .sort()
      .reverse();
    imageGallery = files.map(filename => {
      const match = filename.match(/panda_(\d+)\./);
      const timestamp = match ? parseInt(match[1]) : Date.now();
      return {
        id: match ? match[1] : filename,
        imageUrl: `/images/generated/${filename}`,
        filename,
        timestamp,
        createdAt: new Date(timestamp).toISOString(),
        food: imageMeta[filename]?.food || '',
      };
    });
    console.log(`Loaded ${imageGallery.length} images from disk`);
  } catch (err) {
    console.error('Failed to load gallery from disk:', err);
  }
}

async function generateImage(prompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN が未設定です');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      steps: CF_STEPS,
      // ⚠️ seed は送らない。2026-08-24 に Cloudflare 側のスキーマが厳格化され、
      //    prompt / steps 以外を弾くようになった（AiError 5006）。
      //    seed 無しでも毎回違う絵が出ることは実測で確認済み。
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const detail = body?.errors?.map(e => `${e.code}: ${e.message}`).join(', ') || `HTTP ${res.status}`;
    throw new Error(`Workers AI error — ${detail}`);
  }

  const base64 = body.result?.image;
  if (!base64) throw new Error('Workers AI response had no image field');

  return Buffer.from(base64, 'base64');
}

loadMeta();
loadGalleryFromDisk();
rollDailyCounter();

// nginx が前段にいるので X-Forwarded-For を信頼して実クライアント IP を取る
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '8kb' }));

app.get('/api/can-generate', (req, res) => {
  rollDailyCounter();
  const remainingTime = cooldownFor(req.ip, Date.now());
  const quotaLeft = Math.max(0, DAILY_LIMIT - dailyCount);
  res.json({
    canGenerate: remainingTime === 0 && quotaLeft > 0,
    remainingTime,
    remainingToday: quotaLeft,
    cooldownSeconds: Math.round(RATE_LIMIT_MS / 1000),
  });
});

app.post('/api/generate', async (req, res) => {
  rollDailyCounter();
  const now = Date.now();

  let food, foodEn;
  try {
    ({ food, foodEn } = normalizeFood(req.body?.food));
  } catch {
    return res.status(400).json({
      error: 'Unknown food',
      message: 'その たべものは まだ しらないみたい。したの ボタンから えらんでね',
    });
  }

  const remainingTime = cooldownFor(req.ip, now);
  if (remainingTime > 0) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `つぎまで ${remainingTime} びょう まってね`,
      remainingTime,
    });
  }

  if (dailyCount >= DAILY_LIMIT) {
    return res.status(429).json({
      error: 'Daily limit reached',
      message: '今日のぶんはもうつくったよ。あしたまたきてね！',
      remainingToday: 0,
    });
  }

  if (inFlight >= MAX_CONCURRENT) {
    return res.status(503).json({
      error: 'Busy',
      message: 'いま こんでいます。すこしまってから もういちど おしてね',
    });
  }

  // 失敗時は「元の値」に戻す。消してしまうとレート制限が効かず連打できてしまう
  const previousGenerationTime = ipLastGeneration.get(req.ip);
  ipLastGeneration.set(req.ip, now);
  pruneIpTable(now);
  dailyCount++;
  inFlight++;

  try {
    // ⚠️ NSFW 誤判定は食べもの名によって出る。弾かれたら言い換えて1回だけ再挑戦する。
    //    ここで諦めると「つくれませんでした」しか出せず、利用者には理由が分からない。
    let buf;
    try {
      buf = await generateImage(buildPrompt(foodEn, 0));
    } catch (err) {
      if (!isNsfwRejection(err)) throw err;
      console.warn(`NSFW判定のため言い換えて再挑戦: ${foodEn}`);
      try {
        buf = await generateImage(buildPrompt(foodEn, 1));
      } catch (err2) {
        if (!isNsfwRejection(err2)) throw err2;
        console.warn(`再挑戦も弾かれたので食べもの無しで生成: ${foodEn}`);
        buf = await generateImage(buildPrompt(foodEn, 2));
      }
    }
    const ext = detectExtension(buf);
    if (ext === 'bin') throw new Error('Unknown image format returned by Workers AI');

    const filename = `panda_${Date.now()}.${ext}`;
    writeFileSync(join(IMAGES_DIR, filename), buf);

    if (food) {
      imageMeta[filename] = { food, foodEn };
      saveMeta();
    }

    const localImageUrl = `/images/generated/${filename}`;
    const galleryItem = {
      id: now.toString(),
      imageUrl: localImageUrl,
      filename,
      timestamp: now,
      createdAt: new Date().toISOString(),
      food,
    };

    imageGallery.unshift(galleryItem);
    if (imageGallery.length > 50) imageGallery = imageGallery.slice(0, 50);

    res.json({ success: true, message: '画像生成が完了しました', imageUrl: localImageUrl, timestamp: now, galleryItem });
  } catch (error) {
    // 詳細はサーバーログにだけ残す（クライアントには返さない）
    console.error('Generation failed:', error);
    if (previousGenerationTime === undefined) ipLastGeneration.delete(req.ip);
    else ipLastGeneration.set(req.ip, previousGenerationTime);
    dailyCount--;
    res.status(500).json({ error: 'Generation failed', message: 'つくれませんでした。もういちど おしてね' });
  } finally {
    inFlight--;
  }
});

// 選べるたべものはサーバー側を正とする（画面の選択肢と検証を一致させるため）
app.get('/api/foods', (req, res) => {
  res.json({ success: true, foods: FOOD_LIST });
});

app.get('/api/gallery', (req, res) => {
  res.json({ success: true, images: imageGallery });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`API server running on http://127.0.0.1:${PORT}`);
  console.log(`Model: ${CF_MODEL} (steps=${CF_STEPS}, daily limit=${DAILY_LIMIT})`);
  console.log(`Cooldown: ${RATE_LIMIT_MS / 1000}s per IP, max ${MAX_CONCURRENT} concurrent`);
  console.log(`Cloudflare credentials configured: ${!!CF_ACCOUNT_ID && !!CF_API_TOKEN}`);
});
