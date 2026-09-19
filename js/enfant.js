// =====================================================================
//  Ecran Récompenses (🎁).
//  Solde en grand, points à dépenser, sous-onglets compacts.
//  Bouton large « Donner cette récompense » pour valider immédiatement.
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, modal, gauge, personLabel } from './ui.js';
import { celebrateMilestone } from './cinematics.js';

let root = null;
let children = [], levels = [], balances = [], rewards = [], elig = [], rates = [], current = null, currentTab = 'individual';

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

  // --- bandeau synthétique : solde, niveau, jauge
  const next = lv.next_level_points;
  app.append(el('div', { class: 'hero', style: `background:linear-gradient(150deg,${c.color},#0B2046)` },
    el('div', { class: 'hero-person' }, personLabel(c.first_name, { size: 'lg' })),
    el('div', { class: 'badge' }, lv.level_label || 'Niveau 1'),
    el('div', { class: 'hero-balance', style: 'margin-top:8px' }, String(b)),
    el('div', { class: 'hero-sub' }, 'points à dépenser'),
    next
      ? el('div', {},
          gauge(lv.status_points, next, '#fff'),
          el('div', { class: 'hero-sub', style: 'margin-top:6px' },
            (next - lv.status_points) + ' points cumulés avant le niveau suivant'))
      : el('div', { class: 'hero-sub', style: 'margin-top:10px' }, 'Niveau maximum atteint.'),
    lv.perks ? el('div', { class: 'hero-sub', style: 'margin-top:8px' }, '★ ' + lv.perks) : null));

  // --- sous-onglets horizontaux segmentés (Pour toi / Ensemble / Mon rythme)
  const indRewards = rewards.filter(r => r.scope === 'individual' && r.active);
  const colRewards = rewards.filter(r => r.scope === 'collective' && r.active);

  const subTabs = [
    { id: 'individual', label: 'Pour toi (' + indRewards.length + ')' },
    { id: 'collective', label: 'Ensemble (' + colRewards.length + ')' },
    { id: 'status',     label: 'Mon rythme' }
  ];

  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px' },
    ...subTabs.map(t => el('button', {
      class: 'chip' + (currentTab === t.id ? ' on' : ''),
      onclick: () => { currentTab = t.id; render(); }
    }, t.label))));

  if (currentTab === 'individual') {
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Pour toi'),
      indRewards.length
        ? el('div', { class: 'rewards' }, ...indRewards.map(r => rewardCard(r)))
        : el('p', { class: 'muted' }, 'Aucune récompense individuelle configurée.')));
  } else if (currentTab === 'collective') {
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Ensemble'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Il faut le total, et il faut que chacun ait son minimum. Personne ne paie pour l\'autre.'),
      colRewards.length
        ? el('div', { class: 'rewards' }, ...colRewards.map(r => collectiveCard(r)))
        : el('p', { class: 'muted' }, 'Aucune récompense collective configurée.')));
  } else if (currentTab === 'status') {
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Ton rythme'),
      el('p', { style: 'margin:0' },
        rate(current) > 0
          ? el('span', {}, 'En ce moment tu gagnes ', el('strong', {}, rate(current) + ' points'), ' par semaine.')
          : el('span', { class: 'muted' }, 'Pas encore assez de points pour calculer ton rythme.')),
      lv.next_level_points
        ? el('div', { style: 'margin-top:14px' },
            el('h3', {}, 'Statut ' + (lv.level_label || 'Niveau 1')),
            gauge(lv.status_points, lv.next_level_points, 'var(--cyan)'),
            el('p', { class: 'muted', style: 'margin-top:6px' },
              lv.status_points + ' / ' + lv.next_level_points + ' points cumulés'))
        : null));
  }
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
      ? el('strong', {}, 'Objectif atteint ! Prêt à être attribué.')
      : el('span', {}, 'Il manque ', el('strong', {}, (r.cost - b) + ' points'), ', ', etaText(e.days_left))),
    ready ? el('button', {
      class: 'btn btn-primary btn-block reward-action-btn',
      style: 'margin-top:12px;width:100%',
      onclick: () => giveDirect(r, [{ child_id: current, points: r.cost }])
    }, '🎁 Donner cette récompense') : null);
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
      class: 'btn btn-primary btn-block reward-action-btn',
      style: 'margin-top:12px;width:100%',
      onclick: () => splitModal(r)
    }, '🎁 Donner cette sortie collective') : null);
}

// Repartition collective et attribution directe
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
    label: '🎁 Confirmer et donner', class: 'btn-primary',
    onClick: async close => {
      close();
      await giveDirect(r, children.map((c, i) => ({ child_id: c.id, points: parts[i] })));
    }
  }]);
}

async function giveDirect(r, shares) {
  // Calcul des impacts
  const c = kid(current);
  const curBal = bal(current);
  const sharePts = shares.find(s => s.child_id === current)?.points || r.cost;
  const nextBal = Math.max(0, curBal - sharePts);

  const confirmBody = el('div', {},
    el('p', { style: 'font-size:1.05rem;line-height:1.5' },
      'Veux-tu vraiment attribuer la récompense ',
      el('strong', {}, r.label), ' à ', el('strong', {}, c.first_name || 'l\'enfant'), ' ?'),
    el('div', { class: 'card', style: 'background:#f8fafc;margin-top:14px;border:1px solid var(--line)' },
      el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
        el('span', { class: 'muted' }, 'Solde actuel'),
        el('strong', { style: 'font-size:1.1rem' }, curBal + ' pts')),
      el('div', { class: 'row', style: 'justify-content:space-between;align-items:center;margin:6px 0' },
        el('span', { class: 'muted' }, 'Coût de la récompense'),
        el('strong', { class: 'neg', style: 'font-size:1.1rem' }, '-' + sharePts + ' pts')),
      el('div', { style: 'border-top:1px solid var(--line);margin:6px 0' }),
      el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
        el('span', { style: 'font-weight:700' }, 'Nouveau solde restant'),
        el('strong', { class: 'pos', style: 'font-size:1.2rem' }, nextBal + ' pts'))));

  modal('Confirmer l\'attribution', confirmBody, [{
    label: '🎁 Confirmer et donner',
    class: 'btn-primary',
    onClick: async close => {
      close();
      try {
        const red = await api.claimReward(r.id, shares);
        celebrateMilestone('🎁 ' + r.label);
        await load();
        render();
        toast('Récompense « ' + r.label + ' » attribuée !', 'ok', 6000);

        // Bandeau d'annulation 10 secondes
        undoBar('Récompense « ' + r.label + ' » (-' + sharePts + ' pts)', async () => {
          try {
            // Retrouver l'événement créé
            const evs = await api.getEvents(20);
            const ev = evs.find(e => e.redemption_id === red.id && e.kind === 'reward');
            if (ev) {
              await api.reverseEvent(ev.id, 'Annulé dans les 10 secondes');
              await load();
              render();
              toast('Attribution annulée, points restitués.');
            }
          } catch (err) { fail(err); }
        }, 10);
      } catch (e) { fail(e); }
    }
  }]);
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
