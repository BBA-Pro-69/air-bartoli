// =====================================================================
//  Saisie rapide. C'est la page qu'un parent ouvre le soir, debout,
//  d'une main. Objectif : un point donne en deux appuis, jamais plus.
//  Il n'y a pas de bouton "valider" : l'appui sur une tuile ecrit.
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, undoBar, modal } from './ui.js';
import { celebrate, celebrateMilestone } from './cinematics.js';

let root = null;
const $ = s => root.querySelector(s);

let state = {
  children: [], cats: [], balances: [], levels: [],
  child: null, dayPart: api.currentDayPart(), date: api.todayISO(),
  root: null, withNote: false
};

const subs   = id => state.cats.filter(c => c.parent_id === id && c.active);
const roots  = () => state.cats.filter(c => !c.parent_id && c.active);
const bal    = id => (state.balances.find(b => b.child_id === id) || {}).balance ?? 0;
const level  = id => state.levels.find(l => l.child_id === id) || {};

async function refresh() {
  [state.balances, state.levels] = await Promise.all([api.getBalances(), api.getLevels()]);
  renderKids();
}

// ---------------------------------------------------------------------
function renderKids() {
  const box = $('#kids'); box.innerHTML = '';
  state.children.forEach(c => {
    const lv = level(c.id);
    box.append(el('button', {
      class: 'kid' + (state.child === c.id ? ' on' : ''),
      style: `--kid:${c.color}`,
      onclick: () => { state.child = c.id; renderKids(); renderTiles(); }
    },
      el('div', { class: 'kid-name' }, c.first_name),
      el('div', { class: 'kid-balance', style: `color:${c.color}` }, String(bal(c.id))),
      el('div', { class: 'kid-level' },
        (lv.level_label || 'Décollage') + ' · ' + (lv.status_points || 0) + ' miles')));
  });
}

function renderChips() {
  const dp = $('#dayparts'); dp.innerHTML = '';
  api.DAY_PARTS.forEach(p => dp.append(el('button', {
    class: 'chip' + (state.dayPart === p.code ? ' on' : ''),
    onclick: () => { state.dayPart = p.code; renderChips(); }
  }, p.label)));

  const rt = $('#roots'); rt.innerHTML = '';
  roots().forEach(r => {
    if (!subs(r.id).length) return;              // les racines sans enfant sont des raccourcis
    rt.append(el('button', {
      class: 'chip' + (state.root === r.id ? ' on' : ''),
      onclick: () => { state.root = r.id; renderChips(); renderTiles(); }
    }, r.label));
  });
}

function renderTiles() {
  const box = $('#tiles'); box.innerHTML = '';
  if (!state.child) { box.append(el('p', { class: 'muted' }, "Choisir d'abord un enfant.")); return; }
  const list = subs(state.root);
  list.forEach(c => box.append(tile(c)));

  const shortcuts = $('#shortcuts'); shortcuts.innerHTML = '';
  roots().filter(r => !subs(r.id).length && r.label !== 'Ajustement')
    .forEach(r => shortcuts.append(tile(r, true)));
}

function tile(cat, free = false) {
  const malus = cat.kind === 'malus';
  const p = malus ? -Math.abs(cat.default_points) : cat.default_points;
  return el('button', {
    class: 'tile ' + (malus ? 'tile-malus' : 'tile-bonus'),
    onclick: ev => (free || state.withNote) ? askThenWrite(cat, free) : write(cat, null, null, ev.currentTarget)
  },
    el('span', { class: 'tile-label' }, cat.label),
    el('span', { class: 'tile-pts' }, free ? 'au choix' : pts(p)));
}

// Saisie avec note, ou points libres pour les categories "au choix".
function askThenWrite(cat, free) {
  const points = el('input', { type: 'number', value: String(cat.default_points), min: '1', max: '50' });
  const note   = el('input', { type: 'text', placeholder: 'Ce qui s\'est passé (facultatif)' });
  const body = el('div', {},
    free ? el('div', { class: 'field' }, el('label', {}, 'Points'), points) : null,
    el('div', { class: 'field' }, el('label', {}, 'Note'), note));
  modal(cat.label, body, [{
    label: 'Enregistrer', class: 'btn-primary',
    onClick: close => { close(); write(cat, free ? Number(points.value) : null, note.value, null); }
  }]);
}

async function write(cat, points, note, origin = null) {
  try {
    const ev = await api.addEvent(state.child, cat.id, points, state.date, state.dayPart, note);
    const child = state.children.find(c => c.id === state.child);
    // La cinématique part dès que la base confirme le nombre réel de points.
    // Le barème n'est donc jamais dupliqué dans le front.
    celebrate(ev.points, origin, cat.label);
    await refresh();
    if (ev.points === 0 && cat.kind === 'malus') {
      toast(child.first_name + ' est déjà à 0 : rien retiré, mais c\'est noté.', 'ok', 5000);
    } else {
      toast(child.first_name + ' · ' + cat.label + ' · ' + pts(ev.points));
    }
    undoBar(cat.label + ' ' + pts(ev.points), async () => {
      try { await api.reverseEvent(ev.id, 'Annulé dans les 10 secondes'); await refresh(); toast('Annulé.'); }
      catch (e) { fail(e); }
    });
  } catch (e) { fail(e); }
}

// ---------------------------------------------------------------------
// Demandes d'echange en attente : c'est ici qu'un parent valide.
// ---------------------------------------------------------------------
async function renderPending() {
  const box = $('#pending'); box.innerHTML = '';
  const list = await api.getPendingRedemptions();
  if (!list.length) { box.parentElement.style.display = 'none'; return; }
  box.parentElement.style.display = '';
  list.forEach(r => {
    const who = r.redemption_shares.map(s => {
      const c = state.children.find(x => x.id === s.child_id);
      return (c ? c.first_name : '?') + ' ' + s.points;
    }).join(' · ');
    box.append(el('div', { class: 'entry' },
      el('div', { class: 'entry-main' },
        el('div', { class: 'entry-cat' }, r.rewards.label),
        el('div', { class: 'entry-meta' }, r.cost_total + ' pts · ' + who)),
      el('button', {
        class: 'btn btn-sm btn-primary', onclick: async () => {
          try {
            await api.approveRedemption(r.id);
            celebrateMilestone('🎁 ' + r.rewards.label);
            toast('Échange validé. Bon vol.');
            await refresh(); renderPending();
          }
          catch (e) { fail(e); }
        }
      }, 'Valider'),
      el('button', {
        class: 'btn btn-sm', onclick: async () => {
          await api.update('redemptions', r.id, { state: 'refused', decided_at: new Date().toISOString() });
          toast('Demande refusée.'); renderPending();
        }
      }, 'Refuser')));
  });
}

// ---------------------------------------------------------------------
export async function mount(container) {
  root = container;
  root.innerHTML = '';
  root.append(
    el('h1', {}, 'Saisie'),
    el('p', { class: 'muted' }, "Un appui sur une tuile enregistre tout de suite. Dix secondes pour revenir en arrière."),
    el('div', { class: 'card' }, el('div', { class: 'kids', id: 'kids' })),
    el('div', { class: 'card' },
      el('div', { class: 'row', style: 'margin-bottom:10px' },
        el('h2', { style: 'margin:0' }, 'Quand ?'),
        el('div', { class: 'spacer' }),
        el('input', {
          type: 'date', id: 'date', value: state.date, max: state.date,
          style: 'width:auto', onchange: e => { state.date = e.target.value; }
        })),
      el('div', { class: 'chips', id: 'dayparts' })),
    el('div', { class: 'card' },
      el('div', { class: 'row', style: 'margin-bottom:10px' },
        el('h2', { style: 'margin:0' }, 'Quoi ?'),
        el('div', { class: 'spacer' }),
        el('label', { class: 'row', style: 'gap:6px;margin:0;cursor:pointer' },
          el('input', {
            type: 'checkbox', style: 'width:auto;min-height:auto',
            onchange: e => { state.withNote = e.target.checked; }
          }), 'Ajouter une note')),
      el('div', { class: 'chips', id: 'roots', style: 'margin-bottom:12px' }),
      el('div', { class: 'tiles', id: 'tiles' })),
    el('div', { class: 'card' },
      el('h2', {}, 'Raccourcis'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Le geste remarquable et le bonus de régularité, à points libres.'),
      el('div', { class: 'tiles', id: 'shortcuts' })),
    el('div', { class: 'card', style: 'display:none' },
      el('h2', {}, 'Échanges à valider'), el('div', { id: 'pending' })));

  try {
    [state.children, state.cats] = await Promise.all([api.getChildren(), api.getCategories()]);
    state.child = state.children[0]?.id || null;
    state.root  = roots().find(r => subs(r.id).length)?.id || null;
    await refresh();
    renderChips(); renderTiles(); renderPending();
  } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try { await refresh(); renderTiles(); renderPending(); } catch (e) { fail(e); }
}
