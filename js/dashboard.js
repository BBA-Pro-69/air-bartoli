// =====================================================================
//  Analyse. Une seule question : ou se gagnent et ou se perdent les
//  points ? Puis : a quel moment de la journee ? C'est ce qui permet
//  de dire "en fin de journee, tu ecoutes moins" plutot que
//  "tu n'ecoutes jamais".
// =====================================================================
import * as api from './api.js';
import { el, pts, fail, divergingBars, lineChart, personLabel } from './ui.js';

let root = null;
let children = [], profile = [], daily = [], levels = [], rates = [];
let jours = 56, enfant = null;

const since = d => {
  const t = new Date(api.todayISO() + 'T12:00:00');
  t.setDate(t.getDate() - d);
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

function render() {
  const app = root; app.innerHTML = '';
  app.append(
    el('h1', {}, 'Analyse'),
    el('div', { class: 'row', style: 'margin-bottom:14px' },
      el('div', { class: 'chips' },
        ...[28, 56, 90].map(d => el('button', {
          class: 'chip' + (jours === d ? ' on' : ''), onclick: () => { jours = d; reload(); }
        }, d + ' jours'))),
      el('div', { class: 'spacer' }),
      el('div', { class: 'chips' },
        el('button', { class: 'chip' + (enfant ? '' : ' on'), onclick: () => { enfant = null; render(); } }, 'Les deux'),
        ...children.map(c => el('button', {
          class: 'chip' + (enfant === c.id ? ' on' : ''),
          onclick: () => { enfant = c.id; render(); }
        }, personLabel(c.first_name, { size: 'sm' })))));

  const p = profile.filter(r => !enfant || r.child_id === enfant);

  // --- niveaux
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Où en sont-ils'),
    el('div', { class: 'grid grid-2' },
      ...children.filter(c => !enfant || c.id === enfant).map(c => {
        const lv = levels.find(l => l.child_id === c.id) || {};
        const rt = (rates.find(r => r.child_id === c.id) || {}).weekly_rate || 0;
        return el('div', { style: `border-left:4px solid ${c.color};padding-left:12px` },
          el('div', { style: 'font-weight:700' }, personLabel(c.first_name, { size: 'sm' })),
          el('div', { class: 'muted' },
            (lv.level_label || 'Décollage') + ' · ' + (lv.status_points || 0) + ' miles de statut'),
          el('div', { class: 'muted' }, 'Rythme : ' + rt + ' pts/semaine' +
            (rt ? (rt > 26 ? ' (au-dessus de l\'étalon de 22)' : rt < 18 ? ' (en dessous de l\'étalon de 22)' : ' (dans l\'étalon)') : '')));
      }))));

  // --- par grande categorie
  const parRacine = agrege(p, 'root_label');
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Par grande catégorie'),
    parRacine.length ? divergingBars(parRacine) : el('p', { class: 'muted' }, 'Pas encore de données.'),
    el('div', { class: 'legend' },
      el('span', {}, el('i', { style: 'background:var(--cyan)' }), 'gagnés'),
      el('span', {}, el('i', { style: 'background:var(--red)' }), 'perdus'))));

  // --- par moment de la journee
  const parMoment = agrege(p.map(r => ({ ...r, dp: api.dayPartLabel(r.day_part) || 'Non précisé' })), 'dp');
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Par moment de la journée'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      "C'est le graphique le plus utile à montrer à un enfant : il déplace le reproche du caractère vers le moment."),
    parMoment.length ? divergingBars(parMoment) : el('p', { class: 'muted' }, 'Pas encore de données.')));

  // --- detail par sous-categorie
  const detail = [...p].sort((a, b) => (a.net_points || 0) - (b.net_points || 0));
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Le détail'),
    el('table', { class: 'responsive' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Catégorie'), el('th', {}, 'Moment'),
        el('th', {}, 'Fois'), el('th', {}, 'Gagnés'), el('th', {}, 'Perdus'), el('th', {}, 'Net'))),
      el('tbody', {}, ...detail.slice(0, 40).map(r => el('tr', {},
        el('td', { 'data-th': 'Catégorie' }, r.category_label),
        el('td', { 'data-th': 'Moment' }, api.dayPartLabel(r.day_part) || '—'),
        el('td', { 'data-th': 'Fois' }, String(r.occurrences)),
        el('td', { 'data-th': 'Gagnés', class: 'pos' }, String(r.gained || 0)),
        el('td', { 'data-th': 'Perdus', class: 'neg' }, String(r.lost || 0)),
        el('td', { 'data-th': 'Net' }, String(r.net_points))))))));

  // --- courbe de solde
  const series = children.filter(c => !enfant || c.id === enfant).map(c => {
    let cumul = 0;
    const byDay = new Map(daily.filter(d => d.child_id === c.id).map(d => [d.event_date, d.net]));
    const points = [];
    const start = new Date(since(jours) + 'T12:00:00');
    for (let i = 0; i <= jours; i++) {
      const iso = new Intl.DateTimeFormat('fr-CA').format(start);
      cumul += byDay.get(iso) || 0;
      points.push({ x: iso, y: Math.max(0, cumul) });
      start.setDate(start.getDate() + 1);
    }
    return { color: c.color, label: c.first_name, points };
  });
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Évolution du solde'),
    lineChart(series),
    el('div', { class: 'legend' },
      ...series.map(s => el('span', { class: 'legend-person' }, el('i', { style: 'background:' + s.color }), personLabel(s.label, { size: 'xs' }))))));
}

async function reload() {
  [profile, daily] = await Promise.all([api.getProfile(), api.getDaily(since(jours))]);
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
