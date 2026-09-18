// =====================================================================
//  Air Bartoli - helpers d'affichage. Aucune dependance.
// =====================================================================
export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'style') n.setAttribute('style', v);
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
}

export const pts = n => (n > 0 ? '+' : '') + n + (Math.abs(n) > 1 ? ' pts' : ' pt');

// --- notifications -----------------------------------------------------
let stack;
export function toast(message, kind = 'ok', ms = 3500) {
  if (!stack) { stack = el('div', { class: 'toasts' }); document.body.append(stack); }
  const t = el('div', { class: 'toast toast-' + kind }, message);
  stack.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}
export const fail = e => toast(e.message || String(e), 'ko', 6000);

// Bandeau d'annulation : dix secondes pour revenir sur une saisie.
export function undoBar(label, onUndo, seconds = 10) {
  $$('.undo').forEach(u => u.remove());
  let left = seconds;
  const count = el('span', { class: 'undo-count' }, String(left));
  const bar = el('div', { class: 'undo' },
    el('span', {}, label),
    el('button', { class: 'undo-btn', onclick: async () => { clearInterval(iv); bar.remove(); await onUndo(); } }, 'Annuler'),
    count);
  document.body.append(bar);
  const iv = setInterval(() => {
    left -= 1; count.textContent = String(left);
    if (left <= 0) { clearInterval(iv); bar.classList.add('out'); setTimeout(() => bar.remove(), 300); }
  }, 1000);
}

// --- fenetre modale ----------------------------------------------------
export function modal(title, content, actions = []) {
  const box = el('div', { class: 'modal-box' },
    el('h2', {}, title), content,
    el('div', { class: 'modal-actions' },
      ...actions.map(a => el('button', { class: 'btn ' + (a.class || ''), onclick: () => a.onClick(close) }, a.label)),
      el('button', { class: 'btn btn-ghost', onclick: () => close() }, 'Fermer')));
  const back = el('div', { class: 'modal', onclick: e => { if (e.target === back) close(); } }, box);
  function close() { back.remove(); }
  document.body.append(back);
  return { close, box };
}

// --- jauge -------------------------------------------------------------
export function gauge(value, max, color = 'var(--cyan)') {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return el('div', { class: 'gauge' },
    el('div', { class: 'gauge-fill', style: `width:${pct}%;background:${color}` }));
}

// --- graphiques SVG ecrits a la main ------------------------------------
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (t, a = {}) => { const n = document.createElementNS(NS, t);
  for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };

// Barres horizontales signees : gains a droite, pertes a gauche.
export function divergingBars(items, { width = 640, rowH = 34 } = {}) {
  const max = Math.max(1, ...items.map(i => Math.max(Math.abs(i.gained || 0), Math.abs(i.lost || 0))));
  const h = Math.max(rowH, items.length * rowH) + 24;
  const mid = width * 0.42, scale = (width - mid - 90) / max, lscale = (mid - 150) / max;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${h}`, class: 'chart', role: 'img' });
  svg.append(svgEl('line', { x1: mid, y1: 4, x2: mid, y2: h - 20, stroke: 'var(--line)' }));
  items.forEach((it, i) => {
    const y = i * rowH + 6, bh = rowH - 14;
    const lost = Math.abs(it.lost || 0), gained = it.gained || 0;
    if (lost) svg.append(svgEl('rect', { x: mid - lost * lscale, y, width: lost * lscale, height: bh, rx: 3, fill: 'var(--red)' }));
    if (gained) svg.append(svgEl('rect', { x: mid, y, width: gained * scale, height: bh, rx: 3, fill: 'var(--cyan)' }));
    const lbl = svgEl('text', { x: mid - lost * lscale - 8, y: y + bh - 2, 'text-anchor': 'end', class: 'chart-label' });
    lbl.textContent = it.label; svg.append(lbl);
    const val = svgEl('text', { x: mid + gained * scale + 8, y: y + bh - 2, class: 'chart-value' });
    val.textContent = (gained ? '+' + gained : '') + (lost ? (gained ? ' / ' : '') + '-' + lost : '');
    svg.append(val);
  });
  return svg;
}

// Courbe de solde cumule, une ligne par enfant.
export function lineChart(series, { width = 640, height = 220 } = {}) {
  const all = series.flatMap(s => s.points);
  if (!all.length) return el('p', { class: 'muted' }, 'Pas encore de données.');
  const maxY = Math.max(1, ...all.map(p => p.y)), n = Math.max(1, ...series.map(s => s.points.length - 1));
  const pad = { l: 34, r: 12, t: 10, b: 22 };
  const X = i => pad.l + (i / n) * (width - pad.l - pad.r);
  const Y = v => height - pad.b - (v / maxY) * (height - pad.t - pad.b);
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart' });
  [0, 0.5, 1].forEach(f => {
    const y = Y(maxY * f);
    svg.append(svgEl('line', { x1: pad.l, y1: y, x2: width - pad.r, y2: y, stroke: 'var(--line)' }));
    const t = svgEl('text', { x: 4, y: y + 4, class: 'chart-axis' });
    t.textContent = Math.round(maxY * f); svg.append(t);
  });
  series.forEach(s => {
    const d = s.points.map((p, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(p.y)).join(' ');
    svg.append(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    const last = s.points[s.points.length - 1];
    svg.append(svgEl('circle', { cx: X(s.points.length - 1), cy: Y(last.y), r: 4, fill: s.color }));
  });
  return svg;
}
