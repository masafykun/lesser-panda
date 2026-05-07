// ── Particle background ──────────────────────────────────────
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function makeParticle() {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -(Math.random() * 0.4 + 0.1),
        r: Math.random() * 1.4 + 0.4,
        alpha: Math.random() * 0.45 + 0.08,
        hue: Math.random() * 60 + 250,
    };
}

function initParticles() {
    particles = Array.from({ length: 90 }, makeParticle);
}

function tickParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -8) { p.y = canvas.height + 8; p.x = Math.random() * canvas.width; }
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 72%, ${p.alpha})`;
        ctx.fill();
    }
    requestAnimationFrame(tickParticles);
}

resizeCanvas();
initParticles();
tickParticles();
window.addEventListener('resize', () => { resizeCanvas(); initParticles(); });

// ── Confetti ─────────────────────────────────────────────────
function launchConfetti() {
    const colors = ['#a855f7', '#ec4899', '#06b6d4', '#f59e0b', '#22c55e', '#e2e8f0'];
    for (let i = 0; i < 90; i++) {
        const el = document.createElement('div');
        el.className = 'confetti-piece';
        const size = Math.random() * 9 + 5;
        el.style.cssText = `
            left: ${Math.random() * 100}vw;
            top: -20px;
            width: ${size}px;
            height: ${size}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
            animation-duration: ${Math.random() * 2.2 + 1.8}s;
            animation-delay: ${Math.random() * 0.6}s;
        `;
        document.body.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }
}

// ── DOM refs ─────────────────────────────────────────────────
const generateBtn  = document.getElementById('generateBtn');
const imageDisplay = document.getElementById('imageDisplay');
const messageEl    = document.getElementById('message');
const timerEl      = document.getElementById('timer');
const galleryEl    = document.getElementById('gallery');
const totalCountEl = document.getElementById('totalCount');
const lightbox     = document.getElementById('lightbox');
const lightboxImg  = document.getElementById('lightboxImg');
const lightboxDate = document.getElementById('lightboxDate');

// ── State ─────────────────────────────────────────────────────
let isGenerating = false;
let timerInterval = null;
let gallery = [];

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadGallery();
    checkStatus();
    generateBtn.addEventListener('click', handleGenerate);
    document.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
});

// ── Gallery loading ───────────────────────────────────────────
async function loadGallery() {
    try {
        const res = await fetch('/api/gallery');
        const data = await res.json();
        if (data.success && data.images) {
            gallery = data.images;
            renderGallery();
        }
    } catch {
        loadFromStorage();
    }
}

function saveToStorage(item) {
    try {
        let local = JSON.parse(localStorage.getItem('pandaGallery') || '[]');
        local.unshift(item);
        if (local.length > 20) local = local.slice(0, 20);
        localStorage.setItem('pandaGallery', JSON.stringify(local));
    } catch { /* storage full or unavailable */ }
}

function loadFromStorage() {
    try {
        const local = JSON.parse(localStorage.getItem('pandaGallery') || '[]');
        if (local.length > 0) { gallery = local; renderGallery(); }
    } catch { /* ignore */ }
}

// ── Render gallery ────────────────────────────────────────────
function renderGallery() {
    if (totalCountEl) totalCountEl.textContent = gallery.length;

    if (gallery.length === 0) {
        galleryEl.innerHTML = `
            <div class="gallery-placeholder">
                <p>まだレッサーパンダがいません</p>
                <p class="sub">さいしょのレッサーパンダをつくってみよう！</p>
            </div>`;
        return;
    }

    galleryEl.innerHTML = gallery.map((item, i) => {
        const dateStr = formatDate(item.createdAt || item.timestamp);
        const delay = Math.min(i * 0.04, 0.6).toFixed(2);
        return `<div class="gallery-item" style="animation-delay:${delay}s"
                     onclick="openLightbox('${item.imageUrl}', '${dateStr}')">
                    <img src="${item.imageUrl}" alt="レッサーパンダ" loading="lazy">
                    <div class="gallery-item-overlay">${dateStr}</div>
                </div>`;
    }).join('');
}

function formatDate(ts) {
    const d = new Date(ts);
    const m   = d.getMonth() + 1;
    const day = d.getDate();
    const h   = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}月${day}日 ${h}:${min}`;
}

// ── Lightbox ──────────────────────────────────────────────────
function openLightbox(url, date) {
    lightboxImg.src = url;
    lightboxDate.textContent = date;
    lightbox.classList.add('active');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

// ── Status check ──────────────────────────────────────────────
async function checkStatus() {
    try {
        const res = await fetch('/api/can-generate');
        const data = await res.json();
        data.canGenerate ? enableBtn() : startTimer(data.remainingTime);
    } catch {
        checkStatusLocal();
    }
}

function checkStatusLocal() {
    const last = localStorage.getItem('lastGenTime');
    if (last) {
        const elapsed = Date.now() - parseInt(last);
        if (elapsed < 60_000) { startTimer(Math.ceil((60_000 - elapsed) / 1000)); return; }
    }
    enableBtn();
}

// ── Generate ──────────────────────────────────────────────────
async function handleGenerate() {
    if (isGenerating) return;
    isGenerating = true;

    generateBtn.disabled = true;
    generateBtn.classList.add('is-loading');
    imageDisplay.classList.add('is-loading');
    showMessage('AIがレッサーパンダをつくっています...', 'info');

    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'つくれませんでした');

        if (data.imageUrl) {
            displayImage(data.imageUrl);
            showMessage('✨ できた！かわいいレッサーパンダだね！', 'success');
            launchConfetti();

            const item = data.galleryItem || {
                id: String(Date.now()),
                imageUrl: data.imageUrl,
                timestamp: data.timestamp || Date.now(),
                createdAt: new Date().toISOString(),
            };
            gallery.unshift(item);
            saveToStorage(item);
            renderGallery();

            localStorage.setItem('lastGenTime', String(Date.now()));
            startTimer(60);
        } else {
            throw new Error('うまくつくれませんでした');
        }
    } catch (err) {
        showMessage(err.message || 'エラーがでちゃった...', 'error');
        enableBtn();
    } finally {
        isGenerating = false;
        generateBtn.classList.remove('is-loading');
        imageDisplay.classList.remove('is-loading');
    }
}

function displayImage(url) {
    const date = formatDate(Date.now());
    imageDisplay.innerHTML = `
        <img src="${url}" alt="AIが生成したレッサーパンダ" class="generated-image"
             onclick="openLightbox('${url}', '${date}')">`;
}

// ── Timer ─────────────────────────────────────────────────────
function startTimer(seconds) {
    let remaining = seconds;
    generateBtn.disabled = true;
    timerEl.classList.remove('timer-hidden');
    timerEl.textContent = `つくるまで: ${remaining}びょう`;

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            timerEl.classList.add('timer-hidden');
            enableBtn();
        } else {
            timerEl.textContent = `つくるまで: ${remaining}びょう`;
        }
    }, 1000);
}

function enableBtn() {
    generateBtn.disabled = false;
    timerEl.classList.add('timer-hidden');
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// ── Messages ──────────────────────────────────────────────────
function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    if (type === 'success' || type === 'error') {
        setTimeout(() => { messageEl.className = 'message msg-hidden'; }, 5000);
    }
}
