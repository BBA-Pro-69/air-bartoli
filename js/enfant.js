// =====================================================================
//  Ecran Récompenses (🎁).
//  1. Bandeau photo XL et solde de points
//  2. Séparateur avec titre centré
//  3. Choix principal : « À gagner » ou « Historique des récompenses »
//  4. Si « À gagner » : sous-onglets « Pour toi » / « Ensemble »
//  5. Si « Historique » : récompenses obtenues avec bouton Annuler
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, modal, gauge, personLabel, undoBar, avatar } from './ui.js';
import { celebrateMilestone } from './cinematics.js';

let root = null;
let children = [], levels = [], balances = [], rewards = [], elig = [], rates = [], rewardHistory = [];
let current = null;
let mainSection = 'catalog'; // 'catalog' | 'history'
let currentTab = 'individual'; // 'individual' | 'collective'

const bal   = id => (balances.find(b => b.child_id === id) || {}).balance ?? 0;
const rate  = id => (rates.find(r => r.child_id === id) || {}).weekly_rate ?? 0;
const level = id => levels.find(l => l.child_id === id) || {};
const kid   = id => children.find(c => c.id === id) || {};

async function load() {
  const [c, lv, b, rw, elg, rt, evs] = await Promise.all([
    api.getChildren(), api.getLevels(), api.getBalances(),
    api.getRewards(), api.getEligibility(), api.getRates(),
    api.getEvents(120)
  ]);
  children = c;
  levels = lv;
  balances = b;
  rewards = rw;
  elig = elg;
  rates = rt;
  // Exclure formellement les récompenses qui ont été annulées (reverses_id existant)
  const reversedIds = new Set(evs.filter(e => e.reverses_id).map(e => e.reverses_id));
  rewardHistory = evs.filter(e => e.kind === 'reward' && !reversedIds.has(e.id));

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

function divider(title) {
  return el('div', { class: 'section-divider' }, el('span', {}, title));
}

function render() {
  const c = kid(current), lv = level(current), b = bal(current);
  const app = root; app.innerHTML = '';

  // Sélecteur d'enfant (photos seules, centrées)
  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px;justify-content:center;gap:14px' },
    ...children.map(k => el('button', {
      class: 'chip' + (k.id === current ? ' on' : ''),
      style: 'border-radius:999px;padding:4px 10px;min-height:50px',
      onclick: () => { current = k.id; render(); }
    }, avatar(k.first_name, { size: 'md', title: k.first_name })))));

  // Bandeau synthétique : photo XL et solde de points
  app.append(el('div', { class: 'hero', style: `background:linear-gradient(150deg,${c.color},#0B2046);padding:24px 16px;text-align:center` },
    el('div', { style: 'display:flex;justify-content:center;margin-bottom:10px' },
      avatar(c.first_name, { size: 'xl', title: c.first_name })),
    el('div', { class: 'hero-balance', style: 'font-size:3rem;line-height:1;margin-top:4px' }, String(b)),
    el('div', { class: 'hero-sub', style: 'font-size:1rem;font-weight:600;opacity:.9' }, 'points à dépenser')));

  // Séparateur avec titre centré
  app.append(divider('Récompenses'));

  // Menu principal : « À gagner » vs « Historique des récompenses »
  const mainTabs = [
    { id: 'catalog', label: '🎁 Récompenses à gagner' },
    { id: 'history', label: '📜 Récompenses acquises' }
  ];

  app.append(el('div', { class: 'chips', style: 'margin-bottom:16px;justify-content:center;gap:10px' },
    ...mainTabs.map(t => el('button', {
      class: 'chip' + (mainSection === t.id ? ' on' : ''),
      style: 'font-weight:700',
      onclick: () => { mainSection = t.id; render(); }
    }, t.label))));

  if (mainSection === 'catalog') {
    renderCatalogSection(app);
  } else {
    renderHistorySection(app);
  }
}

// ---------------------------------------------------------------------
// Section « Récompenses à gagner » (Catalogue)
// ---------------------------------------------------------------------
function renderCatalogSection(app) {
  const indRewards = rewards.filter(r => r.scope === 'individual' && r.active);
  const colRewards = rewards.filter(r => r.scope === 'collective' && r.active);

  const subTabs = [
    { id: 'individual', label: 'Pour toi (' + indRewards.length + ')' },
    { id: 'collective', label: 'Ensemble (' + colRewards.length + ')' }
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
      ...children.map(c => el('div', { style: 'display:flex;align-items:center;gap:6px' },
        avatar(c.first_name, { size: 'xs', title: c.first_name }), ' : ' + bal(c.id) +
        (bal(c.id) >= r.min_per_child ? ' ✓' : ' (il manque ' + (r.min_per_child - bal(c.id)) + ')')))),
    ok ? el('button', {
      class: 'btn btn-primary btn-block reward-action-btn',
      style: 'margin-top:12px;width:100%',
      onclick: () => splitModal(r)
    }, '🎁 Donner cette sortie collective') : null);
}

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

        undoBar('Récompense « ' + r.label + ' » (-' + sharePts + ' pts)', async () => {
          try {
            await api.cancelRedemption(red.id, 'Annulé dans les 10 secondes');
            await load();
            render();
            toast('Attribution annulée, points restitués.');
          } catch (err) { fail(err); }
        }, 10);
      } catch (e) { fail(e); }
    }
  }]);
}

// ---------------------------------------------------------------------
// Section « Historique des récompenses acquises »
// ---------------------------------------------------------------------
function renderHistorySection(app) {
  // Filtrer pour l'enfant en cours
  const childRewards = rewardHistory.filter(e => e.child_id === current);
  const totalSpent = childRewards.reduce((sum, e) => sum + Math.abs(Number(e.points || 0)), 0);

  app.append(el('div', { class: 'card', style: 'background:#fefce8;border-color:#fef08a;margin-bottom:14px' },
    el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
      el('div', {},
        el('h2', { style: 'margin:0;color:var(--navy)' }, 'Total des récompenses acquises'),
        el('p', { class: 'muted', style: 'margin:2px 0 0' }, childRewards.length + ' récompense' + (childRewards.length > 1 ? 's' : '') + ' prise' + (childRewards.length > 1 ? 's' : ''))),
      el('div', { class: 'journal-booster-total', style: 'background:#fef08a;color:#854d0e' },
        el('strong', {}, '-' + totalSpent),
        el('span', {}, 'points')))));

  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Historique des récompenses obtenues'),
    childRewards.length
      ? el('div', { class: 'journal-events', style: 'margin-top:12px' },
          ...childRewards.map(e => {
            const rewardName = e.note ? e.note.replace(/^Echange : /, '') : 'Récompense';
            const refundPts = Math.abs(Number(e.points || 0));
            return el('div', { class: 'entry' },
              el('span', { class: 'entry-dot', style: `background:${kid(current).color || 'var(--line)'}` }),
              el('div', { class: 'entry-main' },
                el('div', { class: 'entry-cat' }, '🎁 ' + rewardName),
                el('div', { class: 'entry-meta' }, api.formatDate(e.event_date))),
              el('strong', { class: 'entry-pts neg' }, '-' + refundPts + ' pts'),
              el('button', {
                class: 'btn btn-sm btn-danger',
                style: 'margin-left:10px',
                onclick: () => confirmCancelInEnfant(e, rewardName, refundPts)
              }, 'Annuler'));
          }))
      : el('p', { class: 'muted' }, 'Aucune récompense acquise pour le moment.')));
}

function confirmCancelInEnfant(e, rewardName, refundPts) {
  const c = kid(current);
  const body = el('div', {},
    el('p', { style: 'font-size:1.05rem;line-height:1.5' },
      'Veux-tu annuler la récompense ',
      el('strong', {}, rewardName), ' et restituer ',
      el('strong', {}, '+' + refundPts + ' points'), ' à ',
      el('strong', {}, c.first_name || 'l\'enfant'), ' ?'),
    el('p', { class: 'muted', style: 'margin-top:8px' },
      'Une écriture de restitution sera ajoutée et le solde sera mis à jour.'));

  modal('Annuler la récompense', body, [{
    label: 'Confirmer l\'annulation',
    class: 'btn-danger',
    onClick: async close => {
      close();
      try {
        if (e.redemption_id) {
          await api.cancelRedemption(e.redemption_id, 'Annulation de récompense');
        } else {
          await api.reverseEvent(e.id, 'Annulation de récompense');
        }
        toast('Récompense annulée (+ ' + refundPts + ' pts restitués).');
        await load();
        render();
      } catch (err) { fail(err); }
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
