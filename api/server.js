import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { join } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { createWriteStream, mkdirSync, readdirSync } from 'fs';
import { pipeline } from 'stream/promises';

dotenv.config();

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = process.env.IMAGES_DIR || join(__dirname, '../frontend/images/generated');

mkdirSync(IMAGES_DIR, { recursive: true });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let lastGenerationTime = 0;
const RATE_LIMIT_MS = 60 * 1000;
let imageGallery = [];

function loadGalleryFromDisk() {
  try {
    const files = readdirSync(IMAGES_DIR)
      .filter(f => f.startsWith('panda_') && f.endsWith('.png'))
      .sort()
      .reverse();
    imageGallery = files.map(filename => {
      const match = filename.match(/panda_(\d+)\.png/);
      const timestamp = match ? parseInt(match[1]) : Date.now();
      return {
        id: match ? match[1] : filename,
        imageUrl: `/images/generated/${filename}`,
        filename,
        timestamp,
        createdAt: new Date(timestamp).toISOString(),
      };
    });
    console.log(`Loaded ${imageGallery.length} images from disk`);
  } catch (err) {
    console.error('Failed to load gallery from disk:', err);
  }
}

loadGalleryFromDisk();

app.use(express.json());

app.get('/api/can-generate', (req, res) => {
  const now = Date.now();
  const elapsed = now - lastGenerationTime;
  const canGenerate = elapsed >= RATE_LIMIT_MS;
  res.json({
    canGenerate,
    remainingTime: canGenerate ? 0 : Math.ceil((RATE_LIMIT_MS - elapsed) / 1000),
  });
});

app.post('/api/generate', async (req, res) => {
  const now = Date.now();
  const elapsed = now - lastGenerationTime;

  if (elapsed < RATE_LIMIT_MS) {
    const remainingTime = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `次の生成まで ${remainingTime} 秒お待ちください`,
      remainingTime,
    });
  }

  lastGenerationTime = now;

  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt:
        'A cute and adorable red panda (lesser panda) in a natural forest habitat, sitting on a tree branch. The red panda has fluffy reddish-brown fur, a long striped tail, and an endearing expression. Photorealistic style, high quality, detailed fur texture, natural lighting, beautiful bokeh background with green leaves.',
      n: 1,
      size: '1024x1024',
      quality: 'hd',
    });

    const imageUrl = response.data[0].url;
    const filename = `panda_${Date.now()}.png`;
    const filepath = join(IMAGES_DIR, filename);

    const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
    await pipeline(imageResponse.data, createWriteStream(filepath));

    const localImageUrl = `/images/generated/${filename}`;
    const galleryItem = {
      id: now.toString(),
      imageUrl: localImageUrl,
      filename,
      timestamp: now,
      createdAt: new Date().toISOString(),
    };

    imageGallery.unshift(galleryItem);
    if (imageGallery.length > 50) imageGallery = imageGallery.slice(0, 50);

    res.json({ success: true, message: '画像生成が完了しました', imageUrl: localImageUrl, timestamp: now, galleryItem });
  } catch (error) {
    console.error('Generation failed:', error);
    lastGenerationTime = 0;
    res.status(500).json({ error: 'Generation failed', message: '画像生成に失敗しました。もう一度お試しください。', details: error.message });
  }
});

app.get('/api/gallery', (req, res) => {
  res.json({ success: true, images: imageGallery });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`API server running on http://127.0.0.1:${PORT}`);
  console.log(`OpenAI API Key configured: ${!!process.env.OPENAI_API_KEY}`);
});
