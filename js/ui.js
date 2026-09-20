// =====================================================================
//  Air Bartoli - helpers d'affichage. Aucune dependance.
// =====================================================================
export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];


const PERSON_AVATARS = {
  keyran: './assets/avatar_Keyran.png',
  riles: './assets/avatar_Rilès.png',
  bruno: './assets/avatar_Bruno.png',
  papa: './assets/avatar_Bruno.png',
  nevine: './assets/avatar_Névine.png',
  maman: './assets/avatar_Névine.png'
};

function personKey(name = '') {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function avatarSrc(name = '') {
  if (typeof name === 'string' && (name.startsWith('http://') || name.startsWith('https://') || name.startsWith('data:'))) {
    return name;
  }
  const key = personKey(name);
  if (PERSON_AVATARS[key]) return PERSON_AVATARS[key];
  const alias = Object.keys(PERSON_AVATARS).find(x => key.startsWith(x + ' ') || key.includes(x));
  return alias ? PERSON_AVATARS[alias] : '';
}

const PERSON_AVATAR_PX = { xs: 24, sm: 36, md: 50, lg: 70, xl: 90 };

export function avatar(name, { size = 'md', className = '', title = name, customSrc = null } = {}) {
  const src = customSrc || avatarSrc(name);
  const px = PERSON_AVATAR_PX[size] || PERSON_AVATAR_PX.md;
  if (!src) return el('span', { class: `person-avatar person-avatar-${size} ${className}`.trim(), 'aria-hidden': 'true' });
  return el('img', {
    class: `person-avatar person-avatar-${size} ${className}`.trim(),
    src,
    alt: title || name,
    title: title || name,
    width: String(px),
    height: String(px),
    loading: 'lazy',
    decoding: 'async'
  });
}

export function personLabel(name, options = {}) {
  return el('span', { class: 'person-label' }, avatar(name, options), el('span', {}, name));
}

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

// ---------------------------------------------------------------------
// Recadreur photo circulaire tactile (type LinkedIn / Instagram)
// ---------------------------------------------------------------------
export function openPhotoCropper({ title = 'Cadrer la photo', isCircle = true, aspectRatio = 1, existingSrc = null, onSave }) {
  const chooseNewFile = () => {
    const input = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    document.body.append(input);

    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => startCropper(img, title, isCircle, aspectRatio, onSave, chooseNewFile, promptWebUrl);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    };

    input.click();
  };

  const promptWebUrl = () => {
    const urlInput = el('input', {
      type: 'url',
      placeholder: 'https://exemple.com/image.jpg',
      style: 'margin-top:6px'
    });
    const promptBody = el('div', {},
      el('p', { class: 'muted', style: 'margin:0 0 10px;font-size:.9rem' },
        'Colle l\'adresse web (URL) d\'une image trouvée sur internet. Elle sera récupérée, cadrée et sauvegardée dans votre application.'),
      el('div', { class: 'field' }, el('label', {}, 'URL de l\'image'), urlInput));

    modal('Importer depuis une URL', promptBody, [{
      label: 'Charger et cadrer',
      class: 'btn-primary',
      onClick: async closePrompt => {
        const rawUrl = urlInput.value.trim();
        if (!rawUrl || !rawUrl.startsWith('http')) {
          toast('Veuillez saisir une URL valide commençant par http:// ou https://', 'ko');
          return;
        }
        closePrompt();
        toast('Chargement de l\'image web…');

        try {
          // Passer par la fonction Edge Supabase proxy-image pour contourner les restrictions CORS
          const proxyUrl = 'https://dgsvpxeqwdyeudqubayd.supabase.co/functions/v1/proxy-image';
          const resp = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: rawUrl })
          });

          if (!resp.ok) {
            throw new Error('Impossible de récupérer l\'image distante');
          }

          const blob = await resp.blob();
          const objectUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            startCropper(img, title, isCircle, aspectRatio, onSave, chooseNewFile, promptWebUrl);
          };
          img.src = objectUrl;
        } catch (err) {
          // Repli direct si le proxy échoue
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => startCropper(img, title, isCircle, aspectRatio, onSave, chooseNewFile, promptWebUrl);
          img.onerror = () => fail(new Error('Impossible de charger cette image web (accès restreint par le site source).'));
          img.src = rawUrl;
        }
      }
    }]);
  };

  const openSourceChoice = () => {
    const choiceBody = el('div', { style: 'display:grid;gap:12px;padding:6px 0' },
      el('button', {
        type: 'button',
        class: 'btn btn-primary',
        style: 'min-height:50px;justify-content:center;font-size:1rem',
        onclick: () => { closeChoice(); chooseNewFile(); }
      }, '📁 Choisir depuis mon appareil / photo'),
      el('button', {
        type: 'button',
        class: 'btn btn-ghost',
        style: 'min-height:50px;justify-content:center;font-size:1rem;border:1.5px solid var(--line)',
        onclick: () => { closeChoice(); promptWebUrl(); }
      }, '🌐 Coller une URL d\'image web'));

    let closeChoice = () => {};
    modal(title || 'Source de l\'image', choiceBody, [{
      label: 'Annuler',
      class: 'btn-ghost',
      onClick: close => { close(); }
    }]);
    // Capturer la fonction close de modal
    const closeBtn = document.querySelector('.modal-backdrop:last-of-type .modal-foot button');
    if (closeBtn) closeChoice = () => closeBtn.click();
  };

  if (existingSrc) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => startCropper(img, title, isCircle, aspectRatio, onSave, chooseNewFile, promptWebUrl);
    img.onerror = () => openSourceChoice();
    img.src = existingSrc;
  } else {
    openSourceChoice();
  }
}

function startCropper(img, title, isCircle, aspectRatio, onSave, onChooseOther = null, onChooseUrl = null) {
  let scale = 1;
  let minScale = 1;
  let posX = 0, posY = 0;
  let isDragging = false;
  let startX = 0, startY = 0;

  // Dimensions de la boîte de cadrage dans le canvas
  const targetW = 280;
  const targetH = isCircle ? 280 : Math.round(targetW / aspectRatio);
  const pad = 10;
  const cropW = targetW - pad * 2;
  const cropH = targetH - pad * 2;

  const canvas = el('canvas', { width: String(targetW), height: String(targetH), class: 'cropper-canvas' });
  const ctx = canvas.getContext('2d');

  // Zoom initial pour couvrir entièrement la zone de coupe
  const scaleW = cropW / img.width;
  const scaleH = cropH / img.height;
  minScale = Math.max(scaleW, scaleH);
  scale = minScale;

  function draw() {
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.save();

    // 1. Dessin de l'image translatée et zoomée
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    // Contraindre le déplacement pour que l'image couvre toujours le cadre
    const maxPosX = Math.max(0, (drawW - cropW) / 2);
    const maxPosY = Math.max(0, (drawH - cropH) / 2);
    posX = Math.max(-maxPosX, Math.min(maxPosX, posX));
    posY = Math.max(-maxPosY, Math.min(maxPosY, posY));

    ctx.drawImage(img, targetW / 2 - drawW / 2 + posX, targetH / 2 - drawH / 2 + posY, drawW, drawH);

    // Cadre guide blanc net SANS aucun filtre sombre ni teinte
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    if (isCircle) {
      ctx.arc(targetW / 2, targetH / 2, cropW / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(pad, pad, cropW, cropH);
    }
    ctx.stroke();
    ctx.shadowColor = 'transparent';

    // Coins de repère discrets
    if (!isCircle) {
      ctx.strokeStyle = 'var(--cyan, #00A7E1)';
      ctx.lineWidth = 3;
      const corner = 14;
      // Haut gauche
      ctx.beginPath(); ctx.moveTo(pad, pad + corner); ctx.lineTo(pad, pad); ctx.lineTo(pad + corner, pad); ctx.stroke();
      // Haut droit
      ctx.beginPath(); ctx.moveTo(pad + cropW - corner, pad); ctx.lineTo(pad + cropW, pad); ctx.lineTo(pad + cropW, pad + corner); ctx.stroke();
      // Bas gauche
      ctx.beginPath(); ctx.moveTo(pad, pad + cropH - corner); ctx.lineTo(pad, pad + cropH); ctx.lineTo(pad + corner, pad + cropH); ctx.stroke();
      // Bas droit
      ctx.beginPath(); ctx.moveTo(pad + cropW - corner, pad + cropH); ctx.lineTo(pad + cropW, pad + cropH); ctx.lineTo(pad + cropW, pad + cropH - corner); ctx.stroke();
    }

    ctx.restore();
  }

  // Événements tactiles et souris pour déplacer l'image
  canvas.addEventListener('pointerdown', e => {
    isDragging = true;
    startX = e.clientX - posX;
    startY = e.clientY - posY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (!isDragging) return;
    posX = e.clientX - startX;
    posY = e.clientY - startY;
    draw();
  });

  const stopDrag = () => { isDragging = false; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  // Curseur de zoom
  const zoomSlider = el('input', {
    type: 'range',
    min: String(minScale),
    max: String(minScale * 3),
    step: '0.01',
    value: String(scale),
    style: 'width:100%;margin:12px 0 6px'
  });

  zoomSlider.oninput = e => {
    scale = Number(e.target.value);
    draw();
  };

  const body = el('div', { style: 'display:flex;flex-direction:column;align-items:center' },
    el('p', { class: 'muted', style: 'margin:0 0 10px;font-size:.85rem;text-align:center' },
      'Fais glisser pour centrer le visage et ajuste le zoom :'),
    canvas,
    el('div', { class: 'row', style: 'width:100%;align-items:center;gap:8px;margin-top:6px' },
      el('span', { style: 'font-size:.8rem;color:var(--muted)' }, 'Zoom'),
      zoomSlider),
    el('p', { class: 'muted', style: 'margin:4px 0 0;font-size:.75rem;text-align:center' },
      'Optimisation automatique à ~35 Ko (idéal pour mobile).'));

  draw();

  const actions = [];
  if (onChooseOther) {
    actions.push({
      label: '📁 Fichier',
      class: 'btn-ghost',
      onClick: close => {
        close();
        onChooseOther();
      }
    });
  }
  if (onChooseUrl) {
    actions.push({
      label: '🌐 URL web',
      class: 'btn-ghost',
      onClick: close => {
        close();
        onChooseUrl();
      }
    });
  }
  actions.push({
    label: 'Valider et enregistrer',
    class: 'btn-primary',
    onClick: async close => {
      // Dimensions finales optimisées
      const outW = isCircle ? 250 : 360;
      const outH = isCircle ? 250 : Math.round(outW / aspectRatio);

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = outW;
      finalCanvas.height = outH;
      const fCtx = finalCanvas.getContext('2d');

      // Découpe DIRECTE depuis l'image source originale : AUCUN filtre, AUCUN masque, AUCUNE altération !
      const srcCropW = cropW / scale;
      const srcCropH = cropH / scale;
      const srcCenterX = img.width / 2 - posX / scale;
      const srcCenterY = img.height / 2 - posY / scale;
      const srcX = Math.max(0, Math.min(img.width - srcCropW, srcCenterX - srcCropW / 2));
      const srcY = Math.max(0, Math.min(img.height - srcCropH, srcCenterY - srcCropH / 2));

      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = 'high';
      fCtx.drawImage(
        img,
        srcX, srcY, srcCropW, srcCropH,
        0, 0, outW, outH
      );

      finalCanvas.toBlob(async blob => {
        close();
        try {
          await onSave(blob);
        } catch (err) { fail(err); }
      }, 'image/jpeg', 0.92);
    }
  });

  modal(title, body, actions);
}
