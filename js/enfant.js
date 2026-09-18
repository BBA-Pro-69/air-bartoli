// =====================================================================
//  Ecran enfant. C'est la page qu'on montre a Keyran et a Riles.
//  Regles : le solde en tres gros, un compte a rebours sous chaque
//  recompense, et AUCUNE comparaison entre les deux freres.
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, modal, gauge, personLabel } from './ui.js';

let root = null;
let children = [], levels = [], balances = [], rewards = [], elig = [], rates = [], current = null;

const bal   = id => (balances.find(b => b.child_id === id) || {}).balance ?? 0;
const rate  = id => (rates.find(r => r.child_id === id) || {}).weekly_rate ?? 0;
const level = id => levels.find(l => l.child_id === id) || {};
const kid   = id => children.find(c => c.id === id) || {};

async function load() {
  [children, levels, balances, rewards, elig, rates] = await Promise.all([
    api.getChildren(), api.getLevels(), api.getBalances(),
    api.getRewards(), api.getEligibility(), api.getRates()]);
  if (!current) current = children[0]?.id;
}

function etaText(days) {
  if (days === null || days === undefined) return 'continue à gagner des points pour voir la date';
  if (days <= 0)  return 'c\'est bon, tu peux le prendre';
  if (days === 1) return 'c\'est pour demain';
  if (days <= 14) return 'dans ' + days + ' jours';
  const w = Math.round(days / 7);
  return 'dans environ ' + w + ' semaines';
}

function render() {
  const c = kid(current), lv = level(current), b = bal(current);
  const app = root; app.innerHTML = '';

  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px' },
    ...children.map(k => el('button', {
      class: 'chip' + (k.id === current ? ' on' : ''),
      onclick: () => { current = k.id; render(); }
    }, personLabel(k.first_name, { size: 'sm' })))));

  // --- bandeau : solde, niveau, distance au niveau suivant
  const next = lv.next_level_points;
  app.append(el('div', { class: 'hero', style: `background:linear-gradient(150deg,${c.color},#0B2046)` },
    el('div', { class: 'hero-person' }, personLabel(c.first_name, { size: 'lg' })),
    el('div', { class: 'badge' }, lv.level_label || 'Décollage'),
    el('div', { class: 'hero-balance', style: 'margin-top:8px' }, String(b)),
    el('div', { class: 'hero-sub' }, 'points à dépenser'),
    next
      ? el('div', {},
          gauge(lv.status_points, next, '#fff'),
          el('div', { class: 'hero-sub', style: 'margin-top:6px' },
            (next - lv.status_points) + ' miles avant le niveau suivant'))
      : el('div', { class: 'hero-sub', style: 'margin-top:10px' }, 'Niveau maximum atteint.'),
    lv.perks ? el('div', { class: 'hero-sub', style: 'margin-top:8px' }, '★ ' + lv.perks) : null));

  // --- ce que tu gagnes en ce moment
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Ton rythme'),
    el('p', { style: 'margin:0' },
      rate(current) > 0
        ? el('span', {}, 'En ce moment tu gagnes ', el('strong', {}, rate(current) + ' points'), ' par semaine.')
        : el('span', { class: 'muted' }, 'Pas encore assez de points pour calculer ton rythme.'))));

  // --- catalogue individuel
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Pour toi'),
    el('div', { class: 'rewards' },
      ...rewards.filter(r => r.scope === 'individual' && r.active).map(r => rewardCard(r)))));

  // --- catalogue collectif
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Ensemble'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Il faut le total, et il faut que chacun ait son minimum. Personne ne paie pour l\'autre.'),
    el('div', { class: 'rewards' },
      ...rewards.filter(r => r.scope === 'collective' && r.active).map(r => collectiveCard(r)))));
}

function rewardCard(r) {
  const b = bal(current);
  const e = elig.find(x => x.reward_id === r.id && x.child_id === current) || {};
  const ready = b >= r.cost;
  return el('div', { class: 'reward' + (ready ? ' ready' : '') },
    el('div', { class: 'reward-top' },
      el('strong', {}, r.label), el('span', { class: 'reward-cost' }, r.cost + ' pts')),
    el('div', { style: 'margin:10px 0 6px' }, gauge(b, r.cost, kid(current).color)),
    el('div', { class: 'eta' }, ready
      ? el('strong', {}, 'Tu peux le prendre !')
      : el('span', {}, 'Il te manque ', el('strong', {}, (r.cost - b) + ' points'), ', ', etaText(e.days_left))),
    ready ? el('button', {
      class: 'btn btn-primary btn-sm', style: 'margin-top:10px',
      onclick: () => ask(r, [{ child_id: current, points: r.cost }])
    }, 'Demander') : null);
}

function collectiveCard(r) {
  const total = children.reduce((s, c) => s + bal(c.id), 0);
  const manquants = children.filter(c => bal(c.id) < r.min_per_child);
  const ok = total >= r.cost && !manquants.length;
  return el('div', { class: 'reward' + (ok ? ' ready' : '') },
    el('div', { class: 'reward-top' },
      el('strong', {}, r.label), el('span', { class: 'reward-cost' }, r.cost + ' pts')),
    el('div', { style: 'margin:10px 0 6px' }, gauge(total, r.cost, 'var(--cyan)')),
    el('div', { class: 'eta' }, 'Cagnotte : ', el('strong', {}, total + ' / ' + r.cost),
      ' · minimum ' + r.min_per_child + ' par personne'),
    el('div', { class: 'eta' },
      ...children.map(c => el('div', {},
        personLabel(c.first_name, { size: 'xs' }), ' : ' + bal(c.id) +
        (bal(c.id) >= r.min_per_child ? ' ✓' : ' (il manque ' + (r.min_per_child - bal(c.id)) + ')')))),
    ok ? el('button', {
      class: 'btn btn-primary btn-sm', style: 'margin-top:10px',
      onclick: () => splitModal(r)
    }, 'Demander') : null);
}

// Repartition d'une sortie collective : proportionnelle aux soldes, mais
// jamais en dessous du minimum par enfant. Le parent peut ajuster.
function splitModal(r) {
  const total = children.reduce((s, c) => s + bal(c.id), 0);
  let parts = children.map(c => Math.max(r.min_per_child, Math.round(r.cost * bal(c.id) / total)));
  const fix = () => {
    const diff = r.cost - parts.reduce((a, b) => a + b, 0);
    const i = parts.indexOf(Math.max(...parts));
    parts[i] += diff;
  };
  fix();
  const inputs = children.map((c, i) => el('input', {
    type: 'number', value: String(parts[i]), min: String(r.min_per_child), max: String(bal(c.id)),
    onchange: e => { parts[i] = Number(e.target.value); somme(); }
  }));
  const tot = el('p', { class: 'muted' });
  const somme = () => {
    const s = parts.reduce((a, b) => a + b, 0);
    tot.textContent = 'Total réparti : ' + s + ' / ' + r.cost + (s === r.cost ? ' ✓' : ' (doit faire exactement le prix)');
  };
  somme();
  const body = el('div', {},
    el('div', { class: 'fields' },
      ...children.map((c, i) => el('div', { class: 'field' }, el('label', {}, personLabel(c.first_name, { size: 'xs' })), inputs[i]))),
    tot);
  modal(r.label, body, [{
    label: 'Envoyer la demande', class: 'btn-primary',
    onClick: close => { close(); ask(r, children.map((c, i) => ({ child_id: c.id, points: parts[i] }))); }
  }]);
}

async function ask(r, shares) {
  try {
    await api.requestRedemption(r.id, shares);
    toast('Demande envoyée. Un parent doit la valider.', 'ok', 5000);
  } catch (e) { fail(e); }
}

export async function mount(container) {
  root = container;
  root.innerHTML = '<p class="muted">Chargement…</p>';
  try { await load(); render(); } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try { await load(); render(); } catch (e) { fail(e); }
}
