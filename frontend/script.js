// ── DOM refs ─────────────────────────────────────────────────
const foodInput   = document.getElementById('foodInput');
const clearBtn    = document.getElementById('clearBtn');
const generateBtn = document.getElementById('generateBtn');
const chipsEl     = document.getElementById('chips');
const noMatchEl   = document.getElementById('noMatch');
const statusEl    = document.getElementById('status');
const wallEl      = document.getElementById('gallery');
const wallEmpty   = document.getElementById('wallEmpty');
const countEl     = document.getElementById('totalCount');
const tallyEl     = document.getElementById('tally');

const lightbox     = document.getElementById('lightbox');
const lightboxImg  = document.getElementById('lightboxImg');
const lightboxFood = document.getElementById('lightboxFood');
const lightboxDate = document.getElementById('lightboxDate');
const lightboxDl   = document.getElementById('lightboxDl');

let gallery = [];
let foods = [];                 // [{ name, emoji }] — サーバーから取得する
const emojiOf = new Map();
let selectedFood = '';          // 実際に送る値。リストにあるものしか入らない
let isGenerating = false;
let timerInterval = null;
let cooldownSeconds = 20;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadFoods();
  loadGallery();
  checkStatus();

  generateBtn.addEventListener('click', handleGenerate);
  foodInput.addEventListener('input', onInput);
  foodInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // 入力中でも、候補が残っていれば先頭を選ぶ
    const visible = [...chipsEl.querySelectorAll('.food:not(.is-hidden)')];
    if (!selectedFood && visible.length) pickFood(visible[0].dataset.food);
    if (!generateBtn.disabled) handleGenerate();
  });
  clearBtn.addEventListener('click', () => {
    foodInput.value = '';
    selectedFood = '';
    onInput();
    foodInput.focus();
  });

  document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
});

// ── たべもの ─────────────────────────────────────────────────
async function loadFoods() {
  try {
    const res = await fetch('/api/foods');
    const data = await res.json();
    if (data.success && Array.isArray(data.foods)) foods = data.foods;
  } catch { /* 取れなければ選択肢なしで動かす */ }

  foods.forEach(f => emojiOf.set(f.name, f.emoji));
  renderChips();
}

function renderChips() {
  chipsEl.textContent = '';
  foods.forEach(f => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'food';
    btn.dataset.food = f.name;

    const emoji = document.createElement('span');
    emoji.className = 'food-emoji';
    emoji.textContent = f.emoji;

    const name = document.createElement('span');
    name.textContent = f.name;

    btn.append(emoji, name);
    btn.addEventListener('click', () => pickFood(selectedFood === f.name ? '' : f.name));
    chipsEl.appendChild(btn);
  });
}

function pickFood(name) {
  selectedFood = name;
  foodInput.value = name;
  clearBtn.classList.toggle('is-hidden', name === '');
  filterChips();
  if (statusEl.classList.contains('err')) setStatus('', '');
}

// 入力は「絞り込み」。リストにある語と完全一致したときだけ選択済みにする
function onInput() {
  const q = foodInput.value.trim();
  clearBtn.classList.toggle('is-hidden', q === '');
  selectedFood = foods.some(f => f.name === q) ? q : '';
  filterChips();
  if (statusEl.classList.contains('err')) setStatus('', '');
}

function filterChips() {
  const q = foodInput.value.trim();
  let visible = 0;
  chipsEl.querySelectorAll('.food').forEach(chip => {
    const name = chip.dataset.food;
    const hit = q === '' || name.includes(q) || q.includes(name);
    chip.classList.toggle('is-hidden', !hit);
    chip.classList.toggle('selected', name === selectedFood);
    if (hit) visible++;
  });
  noMatchEl.classList.toggle('is-hidden', visible > 0 || q === '');
}

// ── アルバム ─────────────────────────────────────────────────
async function loadGallery() {
  try {
    const res = await fetch('/api/gallery');
    const data = await res.json();
    if (data.success && data.images) gallery = data.images;
  } catch { /* 取れなければ空のまま描く */ }
  renderWall();
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function tagTextFor(food) {
  if (!food) return 'そのまま';
  const emoji = emojiOf.get(food);
  return emoji ? `${emoji} ${food}` : food;
}

// たべものは表示テキストなので innerHTML ではなく DOM API で組み立てる
function buildTile(item, index) {
  const dateStr = formatDate(item.createdAt || item.timestamp);
  const food = item.food || '';

  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.style.animationDelay = `${Math.min(index * 0.035, 0.5).toFixed(2)}s`;
  tile.tabIndex = 0;
  const open = () => openLightbox(item.imageUrl, food, dateStr);
  tile.addEventListener('click', open);
  tile.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  const img = document.createElement('img');
  img.src = item.imageUrl;
  img.alt = food ? `${food}を たべている レッサーパンダ` : 'レッサーパンダ';
  img.loading = 'lazy';

  const tag = document.createElement('span');
  tag.className = 'tile-tag';
  tag.textContent = tagTextFor(food);

  tile.append(img, tag);
  return tile;
}

function renderWall() {
  countEl.textContent = gallery.length;
  wallEl.textContent = '';
  wallEmpty.classList.toggle('is-hidden', gallery.length > 0);

  const frag = document.createDocumentFragment();
  gallery.forEach((item, i) => frag.appendChild(buildTile(item, i)));
  wallEl.appendChild(frag);
}

function prependTile(item) {
  const tile = buildTile(item, 0);
  wallEl.prepend(tile);
  wallEmpty.classList.add('is-hidden');

  countEl.textContent = gallery.length;
  tallyEl.classList.remove('bump');
  void tallyEl.offsetWidth;
  tallyEl.classList.add('bump');
}

// 生成中はアルバムの先頭に仮のタイルを置いて、待ち時間を見えるようにする
function addSkeleton(food) {
  const sk = document.createElement('div');
  sk.className = 'tile skeleton';
  const label = document.createElement('span');
  label.className = 'skeleton-label';
  label.textContent = food ? `${food} を たべてるところ…` : 'つくって います…';
  sk.appendChild(label);
  wallEl.prepend(sk);
  wallEmpty.classList.add('is-hidden');
  return sk;
}

// ── ライトボックス ───────────────────────────────────────────
function openLightbox(url, food, date) {
  lightboxImg.src = url;
  lightboxFood.textContent = tagTextFor(food);
  lightboxDate.textContent = date;
  lightboxDl.href = url;
  lightbox.classList.add('active');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('active');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ── ステータス ───────────────────────────────────────────────
function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status ${kind || ''}`;
}

async function checkStatus() {
  try {
    const res = await fetch('/api/can-generate');
    const data = await res.json();
    if (data.cooldownSeconds) cooldownSeconds = data.cooldownSeconds;
    if (data.canGenerate) enableBtn();
    else startTimer(data.remainingTime || cooldownSeconds);
  } catch {
    enableBtn();
  }
}

// ── つくる ───────────────────────────────────────────────────
async function handleGenerate() {
  if (isGenerating) return;

  // 入力があるのにリストと一致していないときは投げない
  const typed = foodInput.value.trim();
  if (typed && !selectedFood) {
    setStatus('その たべものは まだ ないみたい。したから えらんでね', 'err');
    return;
  }

  isGenerating = true;
  const food = selectedFood;

  generateBtn.disabled = true;
  generateBtn.classList.add('is-busy');
  setStatus(food ? `「${food}」を たべてる レッサーパンダを つくって います…` : 'レッサーパンダを つくって います…', '');

  const skeleton = addSkeleton(food);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ food }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'つくれませんでした');
    if (!data.imageUrl) throw new Error('うまく つくれませんでした');

    const item = data.galleryItem || {
      id: String(Date.now()),
      imageUrl: data.imageUrl,
      timestamp: data.timestamp || Date.now(),
      createdAt: new Date().toISOString(),
      food,
    };

    skeleton.remove();
    gallery.unshift(item);
    prependTile(item);
    setStatus('できた！つづけて つくれるよ', 'ok');
    startTimer(cooldownSeconds);
  } catch (err) {
    skeleton.remove();
    setStatus(err.message || 'エラーが でちゃった…', 'err');
    enableBtn();
  } finally {
    isGenerating = false;
    generateBtn.classList.remove('is-busy');
  }
}

// ── まちじかん ───────────────────────────────────────────────
function startTimer(seconds) {
  let remaining = seconds;
  const label = generateBtn.querySelector('.make-label');
  generateBtn.disabled = true;
  label.textContent = `あと ${remaining}びょう`;

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      enableBtn();
    } else {
      label.textContent = `あと ${remaining}びょう`;
    }
  }, 1000);
}

function enableBtn() {
  generateBtn.disabled = false;
  generateBtn.querySelector('.make-label').textContent = 'つくる！';
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}
