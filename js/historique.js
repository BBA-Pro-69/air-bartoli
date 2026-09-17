// =====================================================================
//  Journal. Ajout seul : rien ne s'efface, tout se contrepasse.
//  C'est la page qui rend le systeme incontestable devant un enfant.
// =====================================================================
import * as api from './api.js';
import { mountNav } from './nav.js';
import { $, el, pts, toast, fail, modal } from './ui.js';

let events = [], cats = [], children = [], filtre = null;

const cat = id => cats.find(c => c.id === id) || {};

function render() {
  const app = $('#app'); app.innerHTML = '';
  app.append(
    el('h1', {}, 'Historique'),
    el('p', { class: 'muted' },
      "Aucune ligne n'est jamais supprimée. Une erreur se corrige par une écriture inverse, visible ici."),
    el('div', { class: 'chips', style: 'margin-bottom:14px' },
      el('button', { class: 'chip' + (filtre ? '' : ' on'), onclick: () => { filtre = null; render(); } }, 'Tout'),
      ...children.map(c => el('button', {
        class: 'chip' + (filtre === c.id ? ' on' : ''),
        onclick: () => { filtre = c.id; render(); }
      }, c.first_name))));

  const reversed = new Set(events.filter(e => e.reverses_id).map(e => e.reverses_id));
  const repaired = new Set(events.filter(e => e.repairs_id).map(e => e.repairs_id));
  const list = events.filter(e => !filtre || e.child_id === filtre);
  if (!list.length) { app.append(el('p', { class: 'muted' }, 'Le journal est vide. Le premier point est à donner depuis la saisie.')); return; }

  let jour = null;
  list.forEach(e => {
    if (e.event_date !== jour) { jour = e.event_date; app.append(el('div', { class: 'day-head' }, api.formatDate(jour))); }
    app.append(entry(e, reversed.has(e.id), repaired.has(e.id)));
  });
}

function entry(e, isReversed, isRepaired) {
  const c = children.find(x => x.id === e.child_id);
  const k = cat(e.category_id);
  const parent = k.parent_id ? cat(k.parent_id).label : null;
  const cls = e.kind === 'repair' ? 'rep' : e.points > 0 ? 'pos' : e.points < 0 ? 'neg' : 'muted';
  const meta = [c ? c.first_name : 'Famille', parent, api.dayPartLabel(e.day_part), e.note]
    .filter(Boolean).join(' · ');

  const actions = [];
  if (!isReversed && e.kind !== 'reversal' && e.kind !== 'reward') {
    actions.push(el('button', {
      class: 'btn btn-sm', onclick: () => {
        const r = el('input', { type: 'text', placeholder: 'Pourquoi ? (facultatif)' });
        modal('Annuler cette écriture',
          el('div', {},
            el('p', { class: 'muted' }, "L'écriture reste visible, une ligne inverse est ajoutée en dessous."),
            el('div', { class: 'field' }, el('label', {}, 'Motif'), r)),
          [{ label: 'Annuler l\'écriture', class: 'btn-danger', onClick: async close => {
            close();
            try { await api.reverseEvent(e.id, r.value); await reload(); toast('Écriture contrepassée.'); }
            catch (err) { fail(err); } } }]);
      }
    }, 'Annuler'));
  }
  if (e.points < 0 && k.repairable && !isRepaired && !isReversed) {
    actions.push(el('button', {
      class: 'btn btn-sm', style: 'border-color:var(--green);color:var(--green)',
      onclick: async () => {
        try { await api.repairEvent(e.id, 'Réparé'); await reload(); toast('Réparation enregistrée, la moitié est rendue.'); }
        catch (err) { fail(err); }
      }
    }, 'Réparé'));
  }

  return el('div', { class: 'entry' + (isReversed ? ' cancelled' : '') },
    el('span', { class: 'entry-dot', style: 'background:' + (c ? c.color : 'var(--muted)') }),
    el('div', { class: 'entry-main' },
      el('div', { class: 'entry-cat' },
        k.label || (e.kind === 'reward' ? (e.note || 'Échange') : 'Écriture'),
        isRepaired ? el('span', { class: 'muted' }, ' · réparé') : null),
      el('div', { class: 'entry-meta' }, meta)),
    el('span', { class: 'entry-pts ' + cls }, pts(e.points)),
    ...actions);
}

async function reload() {
  events = await api.getEvents(200);
  render();
}

(async function main() {
  if (!await mountNav()) return;
  try {
    [events, cats, children] = await Promise.all([api.getEvents(200), api.getCategories(), api.getChildren()]);
    render();
  } catch (e) { fail(e); }
})();
