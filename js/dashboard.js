// =====================================================================
//  Analyse. Où se gagnent et où se perdent les points ?
//  Organisation ergonomique par périodes et par thématiques visuelles.
// =====================================================================
import * as api from './api.js';
import { el, pts, fail, divergingBars, lineChart, personLabel } from './ui.js';

let root = null;
let children = [], profile = [], daily = [], levels = [], rates = [];
let period = 'month'; // 'week' | 'month' | '3months' | 'year' | 'all'
let enfant = null;    // null = tous
let graphView = 'categories'; // 'categories' | 'dayparts'
let selectedCats = new Set(); // catégories sélectionnées pour le détail (vide = toutes)

const PERIODS = [
  { id: 'week',    label: 'Semaine', days: 7 },
  { id: 'month',   label: 'Mois',    days: 30 },
  { id: '3months', label: '3 mois',  days: 90 },
  { id: 'year',    label: 'Année',   days: 365 },
  { id: 'all',     label: 'Tout',    days: null }
];

const since = () => {
  const p = PERIODS.find(x => x.id === period);
  if (!p || p.days === null) return '2020-01-01'; // 'all'
  const t = new Date(api.todayISO() + 'T12:00:00');
  t.setDate(t.getDate() - p.days);
  return new Intl.DateTimeFormat('fr-CA').format(t);
};

function agrege(list, cle) {
  const m = new Map();
  list.forEach(r => {
    const k = r[cle] || '—';
    const a = m.get(k) || { label: k, gained: 0, lost: 0 };
    a.gained += r.gained || 0;
    a.lost   += Math.abs(r.lost || 0);
    m.set(k, a);
  });
  return [...m.values()].sort((a, b) => (b.gained + b.lost) - (a.gained + a.lost));
}

function divider(title) {
  return el('div', { class: 'section-divider' },
    el('span', {}, title));
}

function render() {
  const app = root; app.innerHTML = '';
  app.append(el('h1', {}, 'Analyse'));

  // --- Sélecteur de laps de temps
  app.append(
    divider('Laps de temps'),
    el('div', { class: 'chips', style: 'margin-bottom:6px' },
      ...PERIODS.map(p => el('button', {
        class: 'chip' + (period === p.id ? ' on' : ''),
        onclick: () => { period = p.id; reload(); }
      }, p.label))));

  // --- Sélecteur d'enfants
  app.append(
    divider('Enfants'),
    el('div', { class: 'chips', style: 'margin-bottom:14px' },
      el('button', { class: 'chip' + (enfant ? '' : ' on'), onclick: () => { enfant = null; render(); } }, 'Les deux'),
      ...children.map(c => el('button', {
        class: 'chip' + (enfant === c.id ? ' on' : ''),
        onclick: () => { enfant = c.id; render(); }
      }, personLabel(c.first_name, { size: 'sm' })))));

  const p = profile.filter(r => !enfant || r.child_id === enfant);

  // --- 1. Où en sont-ils ? (Statut)
  app.append(divider('Où en sont-ils'));
  app.append(el('div', { class: 'card' },
    el('div', { class: 'grid grid-2' },
      ...children.filter(c => !enfant || c.id === enfant).map(c => {
        const lv = levels.find(l => l.child_id === c.id) || {};
        const rt = (rates.find(r => r.child_id === c.id) || {}).weekly_rate || 0;
        return el('div', { style: `border-left:4px solid ${c.color};padding-left:12px` },
          el('div', { style: 'font-weight:700' }, personLabel(c.first_name, { size: 'sm' })),
          el('div', { class: 'muted' },
            (lv.level_label || 'Niveau 1') + ' · ' + (lv.status_points || 0) + ' pts cumulés'),
          el('div', { class: 'muted' }, 'Rythme : ' + rt + ' pts/semaine' +
            (rt ? (rt > 26 ? ' (au-dessus de l\'étalon de 22)' : rt < 18 ? ' (en dessous de l\'étalon de 22)' : ' (dans l\'étalon)') : '')));
      }))));

  // --- 2. Répartition : Graphique à bascule (Grandes catégories ou Moments de la journée)
  app.append(divider('Répartition des points'));
  const graphTabs = [
    { id: 'categories', label: 'Par grande catégorie' },
    { id: 'dayparts',   label: 'Par moment de la journée' }
  ];
  app.append(el('div', { class: 'chips', style: 'margin-bottom:12px' },
    ...graphTabs.map(t => el('button', {
      class: 'chip' + (graphView === t.id ? ' on' : ''),
      onclick: () => { graphView = t.id; render(); }
    }, t.label))));

  if (graphView === 'categories') {
    const parRacine = agrege(p, 'root_label');
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Par grande catégorie'),
      parRacine.length ? divergingBars(parRacine) : el('p', { class: 'muted' }, 'Pas encore de données.'),
      el('div', { class: 'legend' },
        el('span', {}, el('i', { style: 'background:var(--cyan)' }), 'gagnés'),
        el('span', {}, el('i', { style: 'background:var(--red)' }), 'perdus'))));
  } else {
    const parMoment = agrege(p.map(r => ({ ...r, dp: api.dayPartLabel(r.day_part) || 'Non précisé' })), 'dp');
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Par moment de la journée'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Déplace le reproche du caractère vers le moment de la journée.'),
      parMoment.length ? divergingBars(parMoment) : el('p', { class: 'muted' }, 'Pas encore de données.')));
  }

  // --- 3. Évolution du solde (placée avant le détail)
  app.append(divider('Évolution du solde'));
  const curPeriod = PERIODS.find(x => x.id === period);
  const totalDays = curPeriod?.days || Math.min(365, Math.max(30, daily.length ? Math.round((new Date() - new Date(daily[0].event_date)) / 864e5) : 30));
  const series = children.filter(c => !enfant || c.id === enfant).map(c => {
    let cumul = 0;
    const byDay = new Map(daily.filter(d => d.child_id === c.id).map(d => [d.event_date, d.net]));
    const points = [];
    const start = new Date(since() + 'T12:00:00');
    for (let i = 0; i <= totalDays; i++) {
      const iso = new Intl.DateTimeFormat('fr-CA').format(start);
      cumul += byDay.get(iso) || 0;
      points.push({ x: iso, y: Math.max(0, cumul) });
      start.setDate(start.getDate() + 1);
    }
    return { color: c.color, label: c.first_name, points };
  });

  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Courbe de solde'),
    lineChart(series),
    el('div', { class: 'legend' },
      ...series.map(s => el('span', { class: 'legend-person' }, el('i', { style: 'background:' + s.color }), personLabel(s.label, { size: 'xs' }))))));

  // --- 4. Le détail (filtrable par catégorie avec liste déroulante)
  app.append(divider('Détail des catégories'));
  
  // Extraire la liste unique des catégories disponibles
  const availableCats = [...new Map(p.map(r => [r.category_id, r.category_label])).entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const selectCat = el('select', {
    style: 'margin-bottom:12px;max-width:320px',
    onchange: e => {
      const val = e.target.value;
      selectedCats.clear();
      if (val !== 'all') selectedCats.add(val);
      render();
    }
  },
    el('option', { value: 'all', selected: selectedCats.size === 0 }, 'Toutes les catégories (' + availableCats.length + ')'),
    ...availableCats.map(c => el('option', { value: c.id, selected: selectedCats.has(c.id) }, c.label)));

  const filteredDetail = p
    .filter(r => selectedCats.size === 0 || selectedCats.has(r.category_id))
    .sort((a, b) => (a.net_points || 0) - (b.net_points || 0));

  app.append(el('div', { class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:8px' },
      el('h2', { style: 'margin:0' }, 'Détail chiffré'),
      el('div', { class: 'spacer' }),
      selectCat),
    el('table', { class: 'responsive' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Enfant'),
        el('th', {}, 'Catégorie'), el('th', {}, 'Moment'),
        el('th', {}, 'Fois'), el('th', {}, 'Gagnés'), el('th', {}, 'Perdus'), el('th', {}, 'Net'))),
      el('tbody', {}, ...(filteredDetail.length ? filteredDetail.slice(0, 60).map(r => {
        const c = children.find(k => k.id === r.child_id);
        return el('tr', {},
          el('td', { 'data-th': 'Enfant' }, personLabel(c?.first_name || '—', { size: 'xs' })),
          el('td', { 'data-th': 'Catégorie' }, r.category_label),
          el('td', { 'data-th': 'Moment' }, api.dayPartLabel(r.day_part) || '—'),
          el('td', { 'data-th': 'Fois' }, String(r.occurrences)),
          el('td', { 'data-th': 'Gagnés', class: 'pos' }, String(r.gained || 0)),
          el('td', { 'data-th': 'Perdus', class: 'neg' }, String(r.lost || 0)),
          el('td', { 'data-th': 'Net' }, String(r.net_points)));
      }) : [
        el('tr', {}, el('td', { colspan: '7', class: 'muted', style: 'text-align:center;padding:16px' }, 'Aucune donnée pour cette sélection.'))
      ])))));
}

async function reload() {
  [profile, daily] = await Promise.all([api.getProfile(), api.getDaily(since())]);
  render();
}

export async function mount(container) {
  root = container;
  root.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    [children, levels, rates] = await Promise.all([api.getChildren(), api.getLevels(), api.getRates()]);
    await reload();
  } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try {
    [children, levels, rates] = await Promise.all([api.getChildren(), api.getLevels(), api.getRates()]);
    await reload();
  } catch (e) { fail(e); }
}
