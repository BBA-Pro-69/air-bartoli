// =====================================================================
// Journal Air Bartoli
// Calendrier compact, lecture d'aujourd'hui et détail enfant par enfant.
// Le journal reste append-only : annuler ajoute une écriture inverse.
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, modal, avatar, personLabel } from './ui.js';

let root = null;
let events = [], daily = [], cats = [], children = [];
let view = 'calendar';
let filter = null;
let cursor = api.todayISO();
let selectedDay = api.todayISO();

const cat = id => cats.find(c => c.id === id) || {};
const child = id => children.find(c => c.id === id) || null;

function dateObj(iso) { return new Date(iso + 'T12:00:00'); }
function isoDate(d) { return new Intl.DateTimeFormat('fr-CA').format(d); }
function addDays(iso, n) {
  const d = dateObj(iso); d.setDate(d.getDate() + n); return isoDate(d);
}
function monthStart(iso) {
  const d = dateObj(iso); d.setDate(1); return isoDate(d);
}
function monthEnd(iso) {
  const d = dateObj(iso); d.setMonth(d.getMonth() + 1, 0); return isoDate(d);
}
function monthLabel(iso) {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(dateObj(monthStart(iso)));
}
function dayLabel(iso) {
  const text = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(dateObj(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function shortDay(iso) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(dateObj(iso));
}

function dayStats(childId, date) {
  const d = daily.find(x => x.child_id === childId && x.event_date === date);
  const gained = Number(d?.gained || 0);
  const lost = Number(d?.lost || 0); // negatif dans la vue
  const spent = Number(d?.spent || 0); // negatif dans la vue
  const behaviorNet = gained + lost;
  return {
    gained,
    lost: Math.abs(lost),
    spent: Math.abs(spent),
    net: Number(d?.net || 0),
    score: Math.max(0, behaviorNet),
    entries: Number(d?.entries || 0)
  };
}

function childrenToShow() {
  return filter ? children.filter(c => c.id === filter) : children;
}

function dailyMapFor(date) {
  return childrenToShow().map(c => ({ child: c, stats: dayStats(c.id, date) }));
}

function eventFlags(list) {
  return {
    reversed: new Set(list.filter(e => e.reverses_id).map(e => e.reverses_id)),
    repaired: new Set(list.filter(e => e.repairs_id).map(e => e.repairs_id))
  };
}

function render() {
  if (!root) return;
  root.innerHTML = '';
  root.append(
    el('div', { class: 'journal-heading' },
      el('div', {}, el('h1', {}, 'Journal'),
        el('p', { class: 'muted' }, 'Un regard sur les journées, puis le détail quand tu en as besoin.')),
      el('span', { class: 'journal-badge' }, view === 'calendar' ? 'Vue calendrier' : 'Aujourd’hui')),
    renderViewSwitch(),
    renderChildFilter(),
    view === 'calendar' ? renderCalendar() : renderToday()
  );
}

function renderViewSwitch() {
  return el('div', { class: 'journal-switch', role: 'tablist', 'aria-label': 'Vue du journal' },
    el('button', { class: 'journal-switch-btn' + (view === 'calendar' ? ' on' : ''),
      role: 'tab', 'aria-selected': view === 'calendar', onclick: () => { view = 'calendar'; loadPeriod(); } },
      'Calendrier'),
    el('button', { class: 'journal-switch-btn' + (view === 'today' ? ' on' : ''),
      role: 'tab', 'aria-selected': view === 'today', onclick: () => { view = 'today'; selectedDay = api.todayISO(); cursor = selectedDay; loadPeriod(); } },
      'Aujourd’hui'));
}

function renderChildFilter() {
  return el('div', { class: 'journal-filter', role: 'tablist', 'aria-label': 'Filtrer par enfant' },
    el('span', { class: 'journal-filter-label' }, 'Voir'),
    el('button', { class: 'journal-filter-btn' + (!filter ? ' on' : ''), onclick: () => { filter = null; render(); } }, 'Les deux'),
    ...children.map(c => el('button', {
      class: 'journal-filter-btn' + (filter === c.id ? ' on' : ''),
      style: filter === c.id ? `--filter-color:${c.color}` : '',
      onclick: () => { filter = c.id; render(); }
    }, personLabel(c.first_name, { size: 'sm' }))));
}

function renderPeriodNav(label, previous, next, nextDisabled = false) {
  return el('div', { class: 'journal-period' },
    el('button', { class: 'journal-arrow', 'aria-label': 'Période précédente', onclick: () => { cursor = previous; loadPeriod(); } }, '‹'),
    el('div', { class: 'journal-period-label' }, label),
    el('button', { class: 'journal-arrow', 'aria-label': 'Période suivante', disabled: nextDisabled,
      onclick: () => { cursor = next; loadPeriod(); } }, '›'),
    el('button', { class: 'btn btn-sm journal-today', onclick: () => { cursor = api.todayISO(); selectedDay = cursor; loadPeriod(); } }, 'Aujourd’hui'));
}

function renderCalendar() {
  const start = monthStart(cursor), end = monthEnd(cursor);
  const first = dateObj(start);
  const mondayOffset = (first.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < mondayOffset; i++) days.push(null);
  for (let d = dateObj(start); isoDate(d) <= end; d.setDate(d.getDate() + 1)) days.push(isoDate(d));
  while (days.length % 7) days.push(null);

  const weekNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const cells = days.map(day => {
    if (!day) return el('div', { class: 'journal-day blank', 'aria-hidden': 'true' });
    const rows = dailyMapFor(day).map(({ child: c, stats }) => {
      const has = stats.entries > 0;
      const cls = 'journal-day-score ' + (has ? (stats.score > 0 ? 'positive' : 'zero') : 'empty');
      return el('div', { class: cls, title: c.first_name + ' : ' + stats.score + ' point' + (stats.score > 1 ? 's' : '') },
        avatar(c.first_name, { size: 'xs', title: c.first_name }),
        el('strong', {}, has ? String(stats.score) : '·'));
    });
    const isToday = day === api.todayISO();
    const isSelected = day === selectedDay;
    return el('button', { class: 'journal-day' + (isToday ? ' today' : '') + (isSelected ? ' selected' : ''),
      onclick: () => { selectedDay = day; openDay(day); } },
      el('span', { class: 'journal-day-number' }, String(dateObj(day).getDate())),
      el('div', { class: 'journal-day-scores' }, ...rows));
  });

  return el('section', { class: 'journal-calendar-card card' },
    renderPeriodNav(monthLabel(cursor), addDays(start, -1), addDays(end, 1)),
    el('p', { class: 'journal-hint' }, 'Chaque case affiche le score pédagogique de la journée. Appuie sur une journée pour voir le détail enfant par enfant.'),
    el('div', { class: 'journal-weekdays' }, ...weekNames.map(x => el('span', {}, x))),
    el('div', { class: 'journal-grid' }, ...cells),
    el('div', { class: 'journal-legend' },
      el('span', {}, 'Score du jour, jamais inférieur à 0'),
      el('span', {}, '· = rien saisi')));
}

function renderToday() {
  const day = selectedDay || api.todayISO();
  const previous = addDays(day, -1);
  const next = addDays(day, 1);
  const isToday = day === api.todayISO();
  const rows = dailyMapFor(day);
  const dayEvents = events.filter(e => e.event_date === day && (!filter || e.child_id === filter));
  const flags = eventFlags(events);

  const summaries = rows.map(({ child: c, stats }) => el('div', { class: 'journal-summary', style: `--kid:${c.color}` },
    el('div', { class: 'journal-summary-top' },
      personLabel(c.first_name, { size: 'sm' }),
      el('span', { class: 'journal-summary-score' }, String(stats.score) + ' pt' + (stats.score > 1 ? 's' : ''))),
    el('div', { class: 'journal-summary-metrics' },
      el('span', {}, '+' + stats.gained),
      el('span', { class: stats.lost ? 'has-loss' : '' }, stats.lost ? '-' + stats.lost : '0 malus'),
      stats.spent ? el('span', {}, '−' + stats.spent + ' dépensés') : null),
    el('div', { class: 'journal-summary-note' }, stats.entries ? stats.entries + ' écriture' + (stats.entries > 1 ? 's' : '') : 'Aucune saisie')));

  return el('section', { class: 'journal-today-card' },
    renderPeriodNav(dayLabel(day), previous, next, isToday),
    el('div', { class: 'journal-today-actions' },
      isToday ? el('span', { class: 'journal-live' }, '● Aujourd’hui') : el('button', { class: 'btn btn-sm', onclick: () => { selectedDay = api.todayISO(); cursor = selectedDay; loadPeriod(); } }, 'Revenir à aujourd’hui')),
    el('div', { class: 'journal-summary-grid' }, ...summaries),
    el('div', { class: 'journal-timeline-title' }, 'Historique de la journée'),
    dayEvents.length
      ? el('div', { class: 'journal-events' }, ...dayEvents.map(e => entry(e, flags.reversed.has(e.id), flags.repaired.has(e.id))))
      : el('div', { class: 'journal-empty card' }, 'Aucune écriture pour cette journée.'));
}

function entry(e, isReversed, isRepaired) {
  const c = child(e.child_id);
  const k = cat(e.category_id);
  const parent = k.parent_id ? cat(k.parent_id).label : null;
  const cls = e.kind === 'repair' ? 'rep' : e.points > 0 ? 'pos' : e.points < 0 ? 'neg' : 'muted';
  const meta = [parent, api.dayPartLabel(e.day_part), e.note].filter(Boolean).join(' · ');
  const label = e.kind === 'bonus_streak' ? 'Booster'
    : (k.label || (e.kind === 'reward' ? (e.note || 'Échange') : 'Écriture'));
  const actions = [];
  if (!isReversed && e.kind !== 'reversal' && e.kind !== 'reward') {
    actions.push(el('button', { class: 'btn btn-sm', onclick: () => {
      const reason = el('input', { type: 'text', placeholder: 'Pourquoi ? (facultatif)' });
      modal('Annuler cette écriture', el('div', {},
        el('p', { class: 'muted' }, 'L’écriture reste visible, une ligne inverse sera ajoutée.'),
        el('div', { class: 'field' }, el('label', {}, 'Motif'), reason)),
      [{ label: 'Annuler l’écriture', class: 'btn-danger', onClick: async close => {
        close();
        try { await api.reverseEvent(e.id, reason.value); await reload(); toast('Écriture contrepassée.'); }
        catch (err) { fail(err); }
      }}]);
    }}, 'Annuler'));
  }
  if (e.points < 0 && k.repairable && !isRepaired && !isReversed) {
    actions.push(el('button', { class: 'btn btn-sm repair-btn', onclick: async () => {
      try { await api.repairEvent(e.id, 'Réparé'); await reload(); toast('Réparation enregistrée, la moitié est rendue.'); }
      catch (err) { fail(err); }
    }}, 'Réparé'));
  }
  return el('div', { class: 'entry' + (isReversed ? ' cancelled' : '') },
    c ? avatar(c.first_name, { size: 'xs' }) : el('span', { class: 'entry-dot', style: 'background:var(--muted)' }),
    el('div', { class: 'entry-main' },
      el('div', { class: 'entry-cat' }, label,
        isRepaired ? el('span', { class: 'muted' }, ' · réparé') : null),
      el('div', { class: 'entry-meta' }, meta)),
    el('span', { class: 'entry-pts ' + cls }, pts(e.points)),
    ...actions);
}

function openDay(day) {
  const rows = dailyMapFor(day);
  const list = events.filter(e => e.event_date === day && (!filter || e.child_id === filter));
  const flags = eventFlags(events);
  const body = el('div', {},
    el('div', { class: 'journal-modal-summaries' }, ...rows.map(({ child: c, stats }) =>
      el('div', { class: 'journal-modal-summary', style: `--kid:${c.color}` },
        personLabel(c.first_name, { size: 'sm' }), el('b', {}, stats.score + ' pts'),
        el('span', {}, '+' + stats.gained + ' · −' + stats.lost + (stats.spent ? ' · dépensé ' + stats.spent : ''))))),
    list.length ? el('div', { class: 'journal-events' }, ...list.map(e => entry(e, flags.reversed.has(e.id), flags.repaired.has(e.id))))
      : el('p', { class: 'muted' }, 'Aucune écriture cette journée.'));
  modal(dayLabel(day), body, []);
}

async function loadPeriod() {
  try {
    const from = view === 'calendar' ? monthStart(cursor) : selectedDay;
    const to = view === 'calendar' ? monthEnd(cursor) : selectedDay;
    [daily, events, cats, children] = await Promise.all([
      api.getDailyRange(from, to), api.getEventsRange(from, to), api.getCategoriesForHistory(), api.getChildren()
    ]);
    render();
  } catch (e) { fail(e); }
}

async function reload() { await loadPeriod(); }

export async function mount(container) {
  root = container;
  root.innerHTML = '<p class="muted">Chargement…</p>';
  selectedDay = api.todayISO(); cursor = selectedDay;
  await loadPeriod();
}

export async function refreshView() {
  if (!root) return;
  await loadPeriod();
}
