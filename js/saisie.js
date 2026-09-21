// =====================================================================
//  Saisie rapide Air Bartoli.
//  1. Score global actuel en tête
//  2. Score de la journée + Sélecteur de date centré
//  3. Note de la journée (catégorie 'Journée', usage principal)
//  4. Autres catégories (modal avec bonus/malus, réparable, contextes)
//  5. Historique de la journée avec bouton « Réparer » immédiat
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, undoBar, modal, personLabel, avatar } from './ui.js';
import { celebrate, celebrateMilestone } from './cinematics.js';

let root = null;
const $ = s => root.querySelector(s);

let state = {
  children: [], cats: [], balances: [], levels: [], contexts: [],
  child: null, date: api.todayISO(),
  dayEvents: []
};

const subs   = id => state.cats.filter(c => c.parent_id === id && c.active);
const roots  = () => state.cats.filter(c => !c.parent_id && c.active);
const bal    = id => (state.balances.find(b => b.child_id === id) || {}).balance ?? 0;
const level  = id => state.levels.find(l => l.child_id === id) || {};

async function refresh() {
  const [b, lv, evs] = await Promise.all([
    api.getBalances(),
    api.getLevels(),
    api.getEventsRange(state.date, state.date)
  ]);
  state.balances = b;
  state.levels = lv;
  state.dayEvents = evs;

  renderGlobalScores();
  renderDayScoreHeader();
  renderDayTiles();
  renderOtherCategories();
  renderDayHistory();
}

// ---------------------------------------------------------------------
// 1. Score global actuel (tout en haut)
// ---------------------------------------------------------------------
function renderGlobalScores() {
  const box = $('#globalKids');
  if (!box) return;
  box.innerHTML = '';
  state.children.forEach(c => {
    const b = state.balances.find(x => x.child_id === c.id) || {};
    box.append(el('button', {
      class: 'kid kid-centered' + (state.child === c.id ? ' on' : ''),
      style: `--kid:${c.color}`,
      onclick: () => { state.child = c.id; renderGlobalScores(); renderDayScoreHeader(); renderDayTiles(); renderDayHistory(); }
    },
      el('div', { class: 'kid-custom-avatar' },
        avatar(c.first_name, { size: 'xl', customSrc: c.avatar, title: c.first_name })),
      el('strong', { style: 'font-size:1.15rem;font-weight:800;color:var(--navy);margin-top:2px' }, c.first_name),
      el('div', { class: 'kid-balance', style: `color:${c.color};margin:2px 0 0;font-size:2.4rem;line-height:1;font-weight:900` }, String(bal(c.id))),
      el('span', { class: 'muted', style: 'font-size:.82rem;font-weight:600' }, 'points acquis'),
      el('div', { class: 'kid-wallets-breakdown', style: 'display:flex;justify-content:center;gap:6px;margin-top:6px;font-size:.76rem;font-weight:700' },
        el('span', { title: 'Portefeuille (dépenses du quotidien)', style: 'background:#f0f9ff;color:var(--cyan-d);padding:3px 7px;border-radius:8px;border:1px solid #bae6fd' },
          '👛 ' + (b.wallet_balance ?? bal(c.id))),
        el('span', { title: 'Tirelire Magique (épargne avec intérêts)', style: 'background:#fdf4ff;color:#a21caf;padding:3px 7px;border-radius:8px;border:1px solid #f5d0fe' },
          '🐷 ' + (b.savings_balance ?? 0))))));
  });
}

// ---------------------------------------------------------------------
// 2. Score de la journée + sélecteur de date centré
// ---------------------------------------------------------------------
function computeDayStats(childId) {
  const evs = state.dayEvents.filter(e => e.child_id === childId);
  const gained = evs.reduce((sum, e) => sum + (e.points > 0 ? e.points : 0), 0);
  const lost = evs.reduce((sum, e) => sum + (e.points < 0 ? Math.abs(e.points) : 0), 0);
  const net = gained - lost;
  return { gained, lost, net };
}

function renderDayScoreHeader() {
  const container = $('#dayScoresBox');
  if (!container) return;
  container.innerHTML = '';

  state.children.forEach(c => {
    const stats = computeDayStats(c.id);
    const isSelected = state.child === c.id;
    container.append(el('div', {
      class: 'day-score-badge' + (isSelected ? ' active' : ''),
      style: `--kid:${c.color};cursor:pointer`,
      onclick: () => { state.child = c.id; renderGlobalScores(); renderDayScoreHeader(); renderDayTiles(); renderDayHistory(); }
    },
      avatar(c.first_name, { size: 'xs', customSrc: c.avatar, title: c.first_name }),
      el('span', { class: 'name', style: 'font-weight:600;font-size:.9rem;color:var(--ink)' }, c.first_name),
      el('strong', { class: stats.net >= 0 ? 'pos' : 'neg', style: 'font-size:.98rem;margin-left:2px' },
        (stats.net > 0 ? '+' : '') + stats.net + ' pt' + (Math.abs(stats.net) > 1 ? 's' : ''))));
  });
}

// ---------------------------------------------------------------------
// 3. Note de la journée (catégorie racine "Journée" ou équivalent)
// ---------------------------------------------------------------------
function renderDayTiles() {
  const box = $('#dayTiles');
  if (!box) return;
  box.innerHTML = '';
  if (!state.child) {
    box.append(el('p', { class: 'muted' }, 'Choisir d\'abord un enfant.'));
    return;
  }

  const dayRoot = roots().find(r => r.label.toLowerCase() === 'journée' || r.label.toLowerCase() === 'journee');
  const daySubs = dayRoot ? subs(dayRoot.id) : [];

  if (daySubs.length) {
    daySubs.forEach(c => box.append(tile(c, false, null)));
  } else {
    box.append(
      el('button', {
        class: 'tile tile-bonus',
        onclick: ev => openDetailedModal(dayRoot || { label: 'Journée réussie', kind: 'bonus', default_points: 3 })
      },
        el('span', { class: 'tile-label' }, 'Journée réussie'),
        el('span', { class: 'tile-pts' }, '+3 pts')),
      el('button', {
        class: 'tile tile-malus',
        onclick: ev => openDetailedModal(dayRoot || { label: 'Journée difficile', kind: 'malus', default_points: 3 })
      },
        el('span', { class: 'tile-label' }, 'Journée difficile'),
        el('span', { class: 'tile-pts' }, '-3 pts')));
  }
}

function tile(cat, free = false, context = null) {
  const malus = cat.kind === 'malus';
  const ptsVal = cat.default_points ?? 0;
  const p = malus ? -Math.abs(ptsVal) : ptsVal;
  const isNeutral = p === 0;
  const tileClass = isNeutral ? 'tile-neutral' : (malus ? 'tile-malus' : 'tile-bonus');
  const ptsLabel = free ? 'au choix' : (isNeutral ? '0 pt' : pts(p));
  return el('button', {
    class: 'tile ' + tileClass,
    onclick: ev => write(cat, free ? null : p, null, context, cat.kind, cat.repairable, ev.currentTarget)
  },
    el('span', { class: 'tile-label' }, cat.label),
    el('span', { class: 'tile-pts' }, ptsLabel));
}

// ---------------------------------------------------------------------
// 4. Autres catégories (modal avec bonus/malus, réparable et contextes)
// ---------------------------------------------------------------------
function renderOtherCategories() {
  const container = $('#otherCatsButtons');
  if (!container) return;
  container.innerHTML = '';

  const dayRoot = roots().find(r => r.label.toLowerCase() === 'journée' || r.label.toLowerCase() === 'journee');
  const otherRoots = roots().filter(r => !dayRoot || r.id !== dayRoot.id);

  otherRoots.forEach(r => {
    container.append(el('button', {
      class: 'chip',
      style: 'min-height:44px;padding:9px 16px;font-weight:600',
      onclick: () => openDetailedModal(r)
    }, r.label));
  });
}

function openDetailedModal(category) {
  const subList = subs(category.id);
  const hasSubs = subList.length > 0;
  let currentSub = hasSubs ? subList[0] : category;

  // Sens : 'bonus' ou 'malus'
  let currentKind = (currentSub.kind === 'malus') ? 'malus' : 'bonus';
  let isRepairable = (currentKind === 'malus') ? (currentSub.repairable ?? true) : false;

  // Conteneur de prévisualisation de couleur / polarité
  const previewBox = el('div', {
    class: 'point-nature-indicator ' + (currentKind === 'malus' ? 'nature-malus' : 'nature-bonus'),
    style: 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:12px;margin-bottom:14px;font-weight:700'
  },
    el('span', { class: 'nature-text' }, currentKind === 'malus' ? '🔴 Malus (on perd des points)' : '🔵 Bonus (on gagne des points)'),
    el('span', { class: 'nature-sign' }, currentKind === 'malus' ? '−' : '+'));

  // Boutons bascule Bonus / Malus
  const btnBonus = el('button', {
    type: 'button',
    class: 'chip' + (currentKind === 'bonus' ? ' on' : ''),
    style: 'flex:1;min-height:40px;justify-content:center',
    onclick: () => setKind('bonus')
  }, '🔵 Bonus');

  const btnMalus = el('button', {
    type: 'button',
    class: 'chip' + (currentKind === 'malus' ? ' on' : ''),
    style: 'flex:1;min-height:40px;justify-content:center',
    onclick: () => setKind('malus')
  }, '🔴 Malus');

  // Case à cocher Réparable
  const repairCheckbox = el('input', {
    type: 'checkbox',
    checked: isRepairable,
    style: 'width:20px;height:20px;cursor:pointer',
    onchange: e => { isRepairable = e.target.checked; }
  });

  const repairRow = el('label', {
    class: 'row',
    style: 'gap:10px;cursor:pointer;margin-top:10px;display:' + (currentKind === 'malus' ? 'flex' : 'none')
  },
    repairCheckbox,
    el('span', { style: 'font-weight:600;font-size:.9rem;color:var(--ink)' },
      'Action réparable (+50 % des points récupérés si réparé)'));

  function setKind(kind) {
    currentKind = kind;
    btnBonus.classList.toggle('on', kind === 'bonus');
    btnMalus.classList.toggle('on', kind === 'malus');
    previewBox.className = 'point-nature-indicator ' + (kind === 'malus' ? 'nature-malus' : 'nature-bonus');
    previewBox.querySelector('.nature-text').textContent = kind === 'malus' ? '🔴 Malus (on perd des points)' : '🔵 Bonus (on gagne des points)';
    previewBox.querySelector('.nature-sign').textContent = kind === 'malus' ? '−' : '+';
    repairRow.style.display = kind === 'malus' ? 'flex' : 'none';
    if (kind === 'malus') {
      repairCheckbox.checked = true;
      isRepairable = true;
    } else {
      isRepairable = false;
    }
  }

  // Sous-catégories
  const subSelect = el('select', {
    disabled: !hasSubs,
    onchange: e => {
      currentSub = subList.find(s => s.id === e.target.value) || category;
      pointsInput.value = String(currentSub.default_points || 1);
      setKind(currentSub.kind === 'malus' ? 'malus' : 'bonus');
    }
  },
    hasSubs
      ? subList.map(s => el('option', { value: s.id }, s.label))
      : [el('option', { value: category.id }, category.label)]);

  const pointsInput = el('input', {
    type: 'number',
    min: '0',
    max: '50',
    value: String(currentSub.default_points ?? 0)
  });

  // Liste des contextes / moments de la journée
  const contextSelect = el('select', {},
    el('option', { value: '' }, 'Toute la journée (général)'),
    ...state.contexts.map(ctx => el('option', { value: ctx.label }, ctx.label)));

  const noteInput = el('input', {
    type: 'text',
    placeholder: 'Précision sur ce qui s\'est passé (facultatif)'
  });

  const body = el('div', {},
    previewBox,
    el('div', { class: 'field' },
      el('label', {}, 'Nature des points'),
      el('div', { class: 'row', style: 'gap:8px;margin-bottom:8px' }, btnBonus, btnMalus),
      repairRow),
    el('div', { class: 'field' }, el('label', {}, 'Sous-catégorie'), subSelect),
    el('div', { class: 'fields' },
      el('div', { class: 'field' }, el('label', {}, 'Nombre de points'), pointsInput),
      el('div', { class: 'field' }, el('label', {}, 'Moment / Contexte'), contextSelect)),
    el('div', { class: 'field' }, el('label', {}, 'Note'), noteInput));

  modal(category.label, body, [{
    label: 'Enregistrer',
    class: 'btn-primary',
    onClick: async close => {
      const rawVal = Number(pointsInput.value);
      const absPoints = Number.isFinite(rawVal) ? Math.abs(rawVal) : (currentSub.default_points ?? 0);
      const finalPoints = (currentKind === 'malus' && absPoints > 0) ? -absPoints : absPoints;
      const note = noteInput.value.trim() || null;
      const context = contextSelect.value || null;
      close();
      await write(currentSub, finalPoints, note, context, currentKind, isRepairable, null);
    }
  }]);
}

// ---------------------------------------------------------------------
// Écriture d'un événement
// ---------------------------------------------------------------------
async function write(cat, points, note, context = null, forceKind = null, repairable = null, origin = null) {
  try {
    const ev = await api.addEvent(state.child, cat.id, points, state.date, context, note, forceKind, repairable);
    const kidObj = state.children.find(c => c.id === state.child);
    celebrate(ev.points, origin, cat.label);
    await refresh();

    if (ev.points === 0 && (forceKind === 'malus' || cat.kind === 'malus')) {
      toast(kidObj.first_name + ' est déjà à 0 : rien retiré, mais c\'est noté.', 'ok', 5000);
    } else {
      toast(kidObj.first_name + ' · ' + cat.label + ' · ' + pts(ev.points));
    }

    undoBar(cat.label + ' ' + pts(ev.points), async () => {
      try {
        await api.reverseEvent(ev.id, 'Annulé dans les 10 secondes');
        await refresh();
        toast('Annulé.');
      } catch (e) { fail(e); }
    });
  } catch (e) { fail(e); }
}

// ---------------------------------------------------------------------
// 5. Historique de la journée avec bouton « Réparer » immédiat
// ---------------------------------------------------------------------
function renderDayHistory() {
  const box = $('#dayHistoryEntries');
  if (!box) return;
  box.innerHTML = '';

  const evs = state.dayEvents.filter(e => e.child_id === state.child);
  if (!evs.length) {
    box.append(el('p', { class: 'muted' }, 'Aucune saisie enregistrée sur cette date pour cet enfant.'));
    return;
  }

  const reversed = new Set(evs.filter(e => e.reverses_id).map(e => e.reverses_id));
  const repaired = new Set(evs.filter(e => e.repairs_id).map(e => e.repairs_id));

  evs.forEach(e => {
    const isRev = reversed.has(e.id);
    const isRep = repaired.has(e.id);
    const catLabel = e.categories?.label || (e.kind === 'booster' || e.kind === 'bonus_streak' ? 'Booster' : (e.kind === 'reward' ? 'Récompense' : 'Saisie'));
    const meta = [e.day_part, e.note].filter(Boolean).join(' · ');
    const canRepair = e.points < 0 && e.categories?.repairable && !isRev && !isRep;

    box.append(el('div', { class: 'entry' + (isRev ? ' cancelled' : '') },
      el('div', { class: 'entry-main' },
        el('div', { class: 'entry-cat' }, catLabel),
        el('div', { class: 'entry-meta' }, meta || 'Sans précision')),
      el('strong', { class: 'entry-pts ' + (e.points >= 0 ? 'pos' : 'neg') }, (e.points > 0 ? '+' : '') + e.points),
      canRepair ? el('button', {
        class: 'btn btn-sm btn-primary',
        style: 'margin-left:8px',
        onclick: async () => {
          try {
            await api.repairEvent(e.id, 'Réparé depuis la saisie');
            toast('Malus réparé (+50 % récupérés).');
            await refresh();
          } catch (err) { fail(err); }
        }
      }, 'Réparer') : null));
  });
}

// ---------------------------------------------------------------------
// Montée et actualisation de la vue
// ---------------------------------------------------------------------
export async function mount(container) {
  root = container;
  root.innerHTML = '';
  root.append(
    // 1. Score global actuel (tout en haut)
    el('div', { class: 'section-divider', style: 'margin-top:6px' }, el('span', {}, 'Score global actuel')),
    el('div', { class: 'card' }, el('div', { class: 'kids', id: 'globalKids' })),

    // 2. Score de la journée + Sélecteur de date centré
    el('div', { class: 'section-divider' }, el('span', {}, 'Score de la journée')),
    el('div', { class: 'card', style: 'text-align:center' },
      el('div', { class: 'row', style: 'justify-content:center;margin-bottom:12px' },
        el('label', { for: 'saisieDate', style: 'display:none' }, 'Date sélectionnée'),
        el('input', {
          type: 'date', id: 'saisieDate', value: state.date, max: state.date,
          class: 'saisie-date-centered',
          onchange: async e => { state.date = e.target.value; await refresh(); }
        })),
      el('div', { class: 'row', id: 'dayScoresBox', style: 'justify-content:center;gap:10px' })),

    // 3. Note de la journée (catégorie 'Journée')
    el('div', { class: 'section-divider' }, el('span', {}, 'Note de la journée')),
    el('div', { class: 'card' },
      el('div', { class: 'tiles category-tile-grid', id: 'dayTiles' })),

    // 4. Autres catégories
    el('div', { class: 'section-divider' }, el('span', {}, 'Autres catégories')),
    el('div', { class: 'card' },
      el('p', { class: 'muted', style: 'margin-top:-4px;margin-bottom:12px' },
        'Choisis une catégorie pour préciser le moment et ajuster les points :'),
      el('div', { class: 'chips', id: 'otherCatsButtons' })),

    // 5. Historique de la journée
    el('div', { class: 'section-divider' }, el('span', {}, 'Historique de la journée')),
    el('div', { class: 'card' },
      el('div', { id: 'dayHistoryEntries' })));

  try {
    const [children, cats, contexts] = await Promise.all([
      api.getChildren(),
      api.getCategories(),
      api.getContexts().catch(() => [])
    ]);
    state.children = children;
    state.cats = cats;
    state.contexts = contexts;
    state.child = state.children[0]?.id || null;
    await refresh();
  } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try { await refresh(); } catch (e) { fail(e); }
}
