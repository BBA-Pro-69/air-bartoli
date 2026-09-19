// =====================================================================
//  Saisie rapide Air Bartoli.
//  1. Score global actuel en tête
//  2. Titre et règle
//  3. Score de la journée sélectionnée + sélecteur de date
//  4. Note de la journée (catégorie 'Journée', usage principal)
//  5. Autres catégories (modal détaillée avec points ajustables et contextes)
//  6. Historique de la journée avec bouton « Réparer » immédiat
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
    const lv = level(c.id);
    box.append(el('button', {
      class: 'kid' + (state.child === c.id ? ' on' : ''),
      style: `--kid:${c.color}`,
      onclick: () => { state.child = c.id; renderGlobalScores(); renderDayScoreHeader(); renderDayTiles(); renderDayHistory(); }
    },
      el('div', { class: 'kid-name' }, personLabel(c.first_name, { size: 'sm' })),
      el('div', { class: 'kid-balance', style: `color:${c.color}` }, String(bal(c.id))),
      el('div', { class: 'kid-level' },
        (lv.level_label || 'Décollage') + ' · ' + (lv.status_points || 0) + ' miles')));
  });
}

// ---------------------------------------------------------------------
// 3. Score de la journée + sélecteur de date
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
      avatar(c.first_name, { size: 'xs', title: c.first_name }),
      el('span', { class: 'name' }, c.first_name),
      el('strong', { class: stats.net >= 0 ? 'pos' : 'neg' }, (stats.net > 0 ? '+' : '') + stats.net + ' pt' + (Math.abs(stats.net) > 1 ? 's' : ''))));
  });
}

// ---------------------------------------------------------------------
// 4. Note de la journée (catégorie racine "Journée" ou équivalent)
// ---------------------------------------------------------------------
function renderDayTiles() {
  const box = $('#dayTiles');
  if (!box) return;
  box.innerHTML = '';
  if (!state.child) {
    box.append(el('p', { class: 'muted' }, 'Choisir d\'abord un enfant.'));
    return;
  }

  // Chercher la racine "Journée"
  const dayRoot = roots().find(r => r.label.toLowerCase() === 'journée' || r.label.toLowerCase() === 'journee');
  const daySubs = dayRoot ? subs(dayRoot.id) : [];

  if (daySubs.length) {
    daySubs.forEach(c => box.append(tile(c, false, null)));
  } else {
    // Si pas de sous-catégories, proposer les raccourcis bonus/malus par défaut
    box.append(
      el('button', {
        class: 'tile tile-bonus',
        onclick: ev => openDetailedModal(dayRoot || { label: 'Journée réussie', kind: 'bonus', default_points: 3 }, 3)
      },
        el('span', { class: 'tile-label' }, 'Journée réussie'),
        el('span', { class: 'tile-pts' }, '+3 pts')),
      el('button', {
        class: 'tile tile-malus',
        onclick: ev => openDetailedModal(dayRoot || { label: 'Journée difficile', kind: 'malus', default_points: 3 }, 3)
      },
        el('span', { class: 'tile-label' }, 'Journée difficile'),
        el('span', { class: 'tile-pts' }, '-3 pts')));
  }
}

function tile(cat, free = false, context = null) {
  const malus = cat.kind === 'malus';
  const p = malus ? -Math.abs(cat.default_points) : cat.default_points;
  return el('button', {
    class: 'tile ' + (malus ? 'tile-malus' : 'tile-bonus'),
    onclick: ev => write(cat, free ? null : p, null, context, ev.currentTarget)
  },
    el('span', { class: 'tile-label' }, cat.label),
    el('span', { class: 'tile-pts' }, free ? 'au choix' : pts(p)));
}

// ---------------------------------------------------------------------
// 5. Autres catégories (carte détaillée avec sous-catégories et contextes)
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

  const subSelect = el('select', {
    disabled: !hasSubs,
    onchange: e => {
      currentSub = subList.find(s => s.id === e.target.value) || category;
      pointsInput.value = String(currentSub.default_points || 1);
    }
  },
    hasSubs
      ? subList.map(s => el('option', { value: s.id }, s.label))
      : [el('option', { value: category.id }, category.label)]);

  const pointsInput = el('input', {
    type: 'number',
    min: '1',
    max: '50',
    value: String(currentSub.default_points || 1)
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
    el('div', { class: 'field' }, el('label', {}, 'Sous-catégorie'), subSelect),
    el('div', { class: 'fields' },
      el('div', { class: 'field' }, el('label', {}, 'Points attribués'), pointsInput),
      el('div', { class: 'field' }, el('label', {}, 'Moment / Contexte'), contextSelect)),
    el('div', { class: 'field' }, el('label', {}, 'Note'), noteInput));

  modal(category.label, body, [{
    label: 'Enregistrer',
    class: 'btn-primary',
    onClick: async close => {
      const p = Number(pointsInput.value) || currentSub.default_points || 1;
      const note = noteInput.value.trim() || null;
      const context = contextSelect.value || null;
      close();
      await write(currentSub, p, note, context, null);
    }
  }]);
}

// ---------------------------------------------------------------------
// Écriture d'un événement
// ---------------------------------------------------------------------
async function write(cat, points, note, context = null, origin = null) {
  try {
    const ev = await api.addEvent(state.child, cat.id, points, state.date, context, note);
    const kidObj = state.children.find(c => c.id === state.child);
    celebrate(ev.points, origin, cat.label);
    await refresh();

    if (ev.points === 0 && cat.kind === 'malus') {
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
// 6. Historique de la journée avec bouton « Réparer » immédiat
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

  // Drapeaux contrepassé / réparé
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
    // 1. Score global actuel
    el('div', { class: 'section-divider', style: 'margin-top:6px' }, el('span', {}, 'Score global actuel')),
    el('div', { class: 'card' }, el('div', { class: 'kids', id: 'globalKids' })),

    // 2. Titre et règle
    el('h1', { style: 'margin-top:18px' }, 'Saisie'),
    el('p', { class: 'muted', style: 'margin-top:-4px;line-height:1.5' },
      'Un appui sur une tuile enregistre tout de suite.', el('br', {}),
      'Dix secondes pour revenir en arrière.'),

    // 3. Score de la journée + Sélecteur de date
    el('div', { class: 'section-divider' }, el('span', {}, 'Score de la journée')),
    el('div', { class: 'card' },
      el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
        el('div', { class: 'row', id: 'dayScoresBox', style: 'gap:8px' }),
        el('input', {
          type: 'date', id: 'saisieDate', value: state.date, max: state.date,
          style: 'width:auto;min-height:38px;padding:6px 10px',
          onchange: async e => { state.date = e.target.value; await refresh(); }
        }))),

    // 4. Note de la journée (catégorie 'Journée')
    el('div', { class: 'section-divider' }, el('span', {}, 'Note de la journée')),
    el('div', { class: 'card' },
      el('div', { class: 'tiles category-tile-grid', id: 'dayTiles' })),

    // 5. Autres catégories
    el('div', { class: 'section-divider' }, el('span', {}, 'Autres catégories')),
    el('div', { class: 'card' },
      el('p', { class: 'muted', style: 'margin-top:-4px;margin-bottom:12px' },
        'Choisis une catégorie pour préciser le moment et ajuster les points :'),
      el('div', { class: 'chips', id: 'otherCatsButtons' })),

    // 6. Historique de la journée
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
