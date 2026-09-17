// =====================================================================
// Air Bartoli / Keyrilès - cinématiques de récompense
// Inspiré de la mécanique de Santiago-performances :
//   palier 1 : retour discret, dès le premier point
//   palier 2 : pluie de particules, à partir de 5 points
//   palier 3 : célébration complète, à partir de 16 points
//
// Une seule cinématique est jouée à la fois. Les saisies qui arrivent
// pendant l'animation sont cumulées, puis jouées ensemble. Cela évite
// qu'une rafale de points ne transforme l'écran en feu d'artifice illisible.
// =====================================================================

const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let canvas, ctx, raf = null, particles = [];
let busy = false, queued = null;

const COLORS = ['#00A7E1', '#0369a1', '#16a34a', '#f59e0b', '#eab308', '#8b5cf6', '#ffffff'];
const DURATIONS = { 1: 520, 2: 820, 3: 1550 };

function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  addEventListener('resize', fit, { passive: true });
  fit();
  return canvas;
}

function burst(x, y, count, options = {}) {
  if (reduced) return;
  ensureCanvas();
  const colors = options.colors || COLORS;
  for (let i = 0; i < count; i++) {
    const angle = options.up
      ? -Math.PI / 2 + (Math.random() - .5) * (options.spread || 2.4)
      : Math.random() * Math.PI * 2;
    const speed = (options.speed || 3) * (.45 + Math.random());
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (options.push || 0),
      gravity: options.gravity || .12,
      life: options.life || 58,
      max: options.life || 58,
      size: options.size || 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 6,
      spin: (Math.random() - .5) * .35,
      square: !!options.square
    });
  }
  if (!raf) raf = requestAnimationFrame(paint);
}

function paint() {
  const w = innerWidth, h = innerHeight;
  ctx.clearRect(0, 0, w, h);
  particles = particles.filter(p => p.life > 0 && p.y < h + 60);
  particles.forEach(p => {
    p.vy += p.gravity;
    p.vx *= .992;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.spin;
    p.life -= 1;
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    if (p.square) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.7);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  if (particles.length) raf = requestAnimationFrame(paint);
  else {
    raf = null;
    ctx.clearRect(0, 0, w, h);
  }
}

function pop(text, level) {
  if (reduced) return;
  const node = document.createElement('div');
  node.className = `fx-pop fx-pop-${level}`;
  node.textContent = text;
  document.body.append(node);
  setTimeout(() => node.remove(), level === 3 ? 1650 : 1100);
}

function pulse(origin, level) {
  const target = origin?.closest?.('.tile') || origin;
  if (!target || reduced) return;
  target.classList.remove('fx-pulse-1', 'fx-pulse-2', 'fx-pulse-3');
  void target.offsetWidth;
  target.classList.add(`fx-pulse-${level}`);
  setTimeout(() => target.classList.remove(`fx-pulse-${level}`), DURATIONS[level] || 600);
}

function celebrateNow(points, origin, label = '') {
  if (points <= 0) {
    if (origin) pulse(origin, 1);
    return 0;
  }
  const level = points >= 16 ? 3 : points >= 5 ? 2 : 1;
  const rect = origin?.getBoundingClientRect?.();
  const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : innerHeight * .38;
  pulse(origin, level);

  if (level === 1) {
    pop(`+${points} ${points > 1 ? 'points' : 'point'}`, 1);
  } else if (level === 2) {
    pop(`+${points} points`, 2);
    burst(x, y, 18, { up: true, speed: 3.5, push: 1.5, size: 4, life: 48 });
  } else {
    pop(`✈ +${points} points`, 3);
    burst(x, y, 54, { up: true, speed: 6.2, push: 3.4, size: 6, life: 82, square: true });
    setTimeout(() => burst(innerWidth * .22, innerHeight * .40, 38,
      { speed: 5.3, size: 5, life: 76, square: true }), 170);
    setTimeout(() => burst(innerWidth * .78, innerHeight * .40, 38,
      { speed: 5.3, size: 5, life: 76, square: true }), 310);
    setTimeout(() => burst(innerWidth * .50, innerHeight * .25, 48,
      { speed: 6.7, size: 6, life: 88, square: true }), 450);
  }
  return level;
}

function play(points, origin, label) {
  if (busy) {
    if (!queued) queued = { points, origin, label };
    else {
      queued.points += points;
      queued.origin = origin || queued.origin;
      queued.label = label || queued.label;
    }
    return;
  }
  busy = true;
  const level = celebrateNow(points, origin, label);
  setTimeout(() => {
    busy = false;
    if (queued) {
      const next = queued;
      queued = null;
      play(next.points, next.origin, next.label);
    }
  }, DURATIONS[level] || 450);
}

export function celebrate(points, origin, label = '') {
  const value = Number(points) || 0;
  if (!value && value !== 0) return;
  play(value, origin, label);
}

// ---------------------------------------------------------------------
// Retour tactile universel : onde au point de contact sur tout élément
// cliquable, plus une vibration courte. C'est ce qui fait qu'une page web
// est ressentie comme une application.
// ---------------------------------------------------------------------
const RIPPLE_SELECTOR = '.btn, .tile, .chip, .kid, .tabbtn, .am-tile, .am-install, .am-logout, .sw-go, .ib-go';

export function initTouchFeedback() {
  if (initTouchFeedback.done) return;
  initTouchFeedback.done = true;

  document.addEventListener('pointerdown', event => {
    const target = event.target.closest?.(RIPPLE_SELECTOR);
    if (!target || reduced) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    target.classList.add('ripple-host');
    const wave = document.createElement('span');
    wave.className = 'ripple';
    wave.style.width = wave.style.height = size + 'px';
    wave.style.left = (event.clientX - rect.left - size / 2) + 'px';
    wave.style.top = (event.clientY - rect.top - size / 2) + 'px';
    target.append(wave);
    setTimeout(() => wave.remove(), 560);
    try { navigator.vibrate?.(6); } catch (_) {}
  }, { passive: true });
}

// Célébration de palier : quand un enfant change de niveau, ou quand une
// récompense devient accessible. Plus sobre qu'un gain, mais visible.
export function celebrateMilestone(message) {
  if (reduced) { return; }
  pop(message, 3);
  burst(innerWidth / 2, innerHeight * .34, 46, { up: true, speed: 5.6, push: 2.8, size: 5, life: 78, square: true });
  setTimeout(() => burst(innerWidth * .28, innerHeight * .42, 30, { speed: 4.8, size: 5, life: 70, square: true }), 200);
  setTimeout(() => burst(innerWidth * .72, innerHeight * .42, 30, { speed: 4.8, size: 5, life: 70, square: true }), 340);
  try { navigator.vibrate?.([12, 40, 18]); } catch (_) {}
}
