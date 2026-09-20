// =====================================================================
//  Journal Air Bartoli
//  1. Vue Calendrier : vue jour par jour avec score pédagogique.
//  2. Vue Boosters : analyse dédiée des boosters (Semaine, Mois, Année, Libre)
//     avec compteurs, courbe/barres mensuelles et liste groupée.
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, modal, avatar, personLabel } from './ui.js';

let root = null;
let events = [], daily = [], cats = [], children = [];
let view = 'calendar'; // 'calendar' | 'boosters'
let filter = null;
let cursor = api.todayISO();
let selectedDay = api.todayISO();

// Filtres spécifiques pour la vue Boosters
let boosterPeriod = 'month'; // 'week' | 'month' | 'year' | 'custom'
let boosterStartDate = null;
let boosterEndDate = null;

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
function weekStart(iso) {
  const d = dateObj(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}
function weekEnd(iso) {
  return addDays(weekStart(iso), 6);
}

function dayStats(childId, date) {
  const d = daily.find(x => x.child_id === childId && x.event_date === date);
  const gained = Number(d?.gained || 0);
  const lost = Number(d?.lost || 0);
  const spent = Number(d?.spent || 0);
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

// ---------------------------------------------------------------------
// Logique des Boosters
// ---------------------------------------------------------------------
function boosterEntries(list = events) {
  const flags = eventFlags(list);
  return list.filter(e =>
    (e.kind === 'booster' || e.kind === 'bonus_streak') &&
    !flags.reversed.has(e.id) &&
    (!filter || e.child_id === filter));
}

function boosterType(e) {
  return /mensuel|mois/i.test(e.note || '') ? 'month' : 'week';
}

function boosterLabel(e) {
  return boosterType(e) === 'month' ? 'Booster mensuel' : 'Booster hebdomadaire';
}

function boosterGroup(e) {
  if (boosterType(e) === 'month') {
    const start = monthStart(e.event_date);
    return {
      key: 'month:' + start,
      label: 'Mois de ' + monthLabel(start),
      order: start
    };
  }
  const start = weekStart(e.event_date);
  return {
    key: 'week:' + start,
    label: 'Semaine du ' + shortDay(start) + ' au ' + shortDay(weekEnd(start)),
    order: start
  };
}

function render() {
  if (!root) return;
  root.innerHTML = '';
  root.append(
    el('div', { class: 'journal-heading' },
      el('div', {}, el('h1', {}, 'Journal'),
        el('p', { class: 'muted' }, 'Un regard sur les journées ou l\'historique dédié des boosters.')),
      el('span', { class: 'journal-badge' }, view === 'calendar' ? 'Vue Calendrier' : 'Vue Boosters')),
    renderViewSwitch(),
    renderChildFilter(),
    view === 'calendar' ? renderCalendar() : (view === 'boosters' ? renderBoostersView() : renderRewardsView())
  );
}

function renderViewSwitch() {
  return el('div', { class: 'journal-switch', role: 'tablist', 'aria-label': 'Vue du journal' },
    el('button', {
      class: 'journal-switch-btn' + (view === 'calendar' ? ' on' : ''),
      role: 'tab',
      'aria-selected': view === 'calendar',
      onclick: () => { view = 'calendar'; loadPeriod(); }
    }, 'Calendrier'),
    el('button', {
      class: 'journal-switch-btn' + (view === 'boosters' ? ' on' : ''),
      role: 'tab',
      'aria-selected': view === 'boosters',
      onclick: () => { view = 'boosters'; loadPeriod(); }
    }, 'Boosters'),
    el('button', {
      class: 'journal-switch-btn' + (view === 'rewards' ? ' on' : ''),
      role: 'tab',
      'aria-selected': view === 'rewards',
      onclick: () => { view = 'rewards'; loadPeriod(); }
    }, 'Récompenses'));
}

function renderChildFilter() {
  return el('div', { class: 'journal-filter', role: 'tablist', 'aria-label': 'Filtrer par enfant' },
    el('span', { class: 'journal-filter-label' }, 'Voir'),
    el('button', { class: 'journal-filter-btn' + (!filter ? ' on' : ''), onclick: () => { filter = null; render(); } }, 'Les deux'),
    ...children.map(c => el('button', {
      class: 'journal-filter-btn' + (filter === c.id ? ' on' : ''),
      style: (filter === c.id ? `--filter-color:${c.color};` : '') + 'border-radius:999px;padding:3px 8px',
      onclick: () => { filter = c.id; render(); }
    }, avatar(c.first_name, { size: 'sm', customSrc: c.avatar, title: c.first_name }))));
}

// ---------------------------------------------------------------------
// 1. Vue Calendrier
// ---------------------------------------------------------------------
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
  const visibleBoosters = boosterEntries();
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
      el('div', { class: 'journal-day-scores' }, ...rows,
        visibleBoosters.some(e => e.event_date === day)
          ? el('span', { class: 'journal-booster-mark', title: 'Booster gagné ce jour' }, '⚡')
          : null));
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

// ---------------------------------------------------------------------
// 2. Vue Boosters (Onglet dédié avec analyse et graphiques)
// ---------------------------------------------------------------------
function renderBoostersView() {
  const list = boosterEntries();
  const totalPoints = list.reduce((sum, e) => sum + Math.max(Number(e.points || 0), 0), 0);

  // Groupes de boosters
  const groups = new Map();
  list.forEach(e => {
    const group = boosterGroup(e);
    if (!groups.has(group.key)) groups.set(group.key, { ...group, entries: [] });
    groups.get(group.key).entries.push(e);
  });
  const orderedGroups = [...groups.values()].sort((a, b) => b.order.localeCompare(a.order));

  // Graphique mensuel
  const monthlyData = computeBoosterMonthlyGraph(list);

  return el('div', { class: 'journal-boosters-view' },
    // Filtres de laps de temps
    el('div', { class: 'card', style: 'margin-bottom:14px' },
      el('div', { class: 'row', style: 'align-items:center;justify-content:space-between;margin-bottom:10px' },
        el('h2', { style: 'margin:0' }, 'Période d\'analyse'),
        el('div', { class: 'chips' },
          ...[
            { id: 'week', label: 'Semaine' },
            { id: 'month', label: 'Mois' },
            { id: 'year', label: 'Année' },
            { id: 'custom', label: 'Personnalisé' }
          ].map(p => el('button', {
            class: 'chip' + (boosterPeriod === p.id ? ' on' : ''),
            onclick: () => { boosterPeriod = p.id; loadPeriod(); }
          }, p.label)))),

      // Sélecteur de dates libres si 'custom'
      boosterPeriod === 'custom' ? el('div', { class: 'fields', style: 'margin-top:10px' },
        el('div', { class: 'field' },
          el('label', {}, 'Date de début'),
          el('input', {
            type: 'date',
            value: boosterStartDate || addDays(api.todayISO(), -30),
            onchange: e => { boosterStartDate = e.target.value; loadPeriod(); }
          })),
        el('div', { class: 'field' },
          el('label', {}, 'Date de fin'),
          el('input', {
            type: 'date',
            value: boosterEndDate || api.todayISO(),
            onchange: e => { boosterEndDate = e.target.value; loadPeriod(); }
          }))) : null),

    // Carte totale
    el('div', { class: 'card journal-booster-total-card', style: 'margin-bottom:14px;background:#f0f9ff;border-color:#bae6fd' },
      el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
        el('div', {},
          el('h2', { style: 'margin:0;color:var(--navy)' }, 'Total des boosters gagnés'),
          el('p', { class: 'muted', style: 'margin:2px 0 0' }, list.length + ' booster' + (list.length > 1 ? 's' : '') + ' attribué' + (list.length > 1 ? 's' : '') + ' sur la période')),
        el('div', { class: 'journal-booster-total' },
          el('strong', {}, '+' + totalPoints),
          el('span', {}, 'points')))),

    // Courbe / histogramme des boosters par mois
    el('div', { class: 'card', style: 'margin-bottom:14px' },
      el('h2', {}, 'Évolution mensuelle des boosters'),
      el('p', { class: 'muted', style: 'margin-top:-6px' }, 'Points cumulés et nombre de boosters remportés par mois.'),
      renderBoosterMonthlySvg(monthlyData)),

    // Liste détaillée des boosters groupés
    el('div', { class: 'card' },
      el('h2', {}, 'Historique détaillé'),
      orderedGroups.length ? el('div', { class: 'journal-booster-groups' }, ...orderedGroups.map(group =>
        el('div', { class: 'journal-booster-group' },
          el('h3', {}, group.label),
          ...group.entries.map(e => {
            const c = child(e.child_id);
            return el('div', { class: 'journal-booster-row' },
              avatar(c?.first_name || 'Enfant', { size: 'xs', customSrc: c?.avatar, title: c?.first_name || 'Enfant' }),
              el('div', { class: 'journal-booster-main' },
                el('strong', {}, c?.first_name || 'Enfant'),
                el('span', { class: 'muted' }, boosterLabel(e) + ' · ' + api.formatDate(e.event_date) + (e.note ? ' (' + e.note + ')' : ''))),
              el('strong', { class: 'journal-booster-points' }, '+' + Number(e.points || 0)));
          }))))
        : el('p', { class: 'muted' }, 'Aucun booster gagné sur cette période.')));
}

// ---------------------------------------------------------------------
// Graphique SVG mensuel des boosters
// ---------------------------------------------------------------------
function computeBoosterMonthlyGraph(list) {
  const m = new Map();
  list.forEach(e => {
    const start = monthStart(e.event_date);
    const item = m.get(start) || { month: start, label: monthLabel(start), points: 0, count: 0 };
    item.points += Math.max(Number(e.points || 0), 0);
    item.count += 1;
    m.set(start, item);
  });
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function renderBoosterMonthlySvg(data, width = 640, height = 180) {
  if (!data.length) {
    return el('p', { class: 'muted' }, 'Pas encore assez de boosters sur cette période pour tracer le graphique.');
  }
  const maxPts = Math.max(1, ...data.map(d => d.points));
  const padL = 36, padR = 20, padT = 16, padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const colW = Math.min(50, innerW / data.length * 0.55);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'chart');

  // Lignes de repère
  [0, 0.5, 1].forEach(ratio => {
    const y = padT + innerH * (1 - ratio);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', padL); line.setAttribute('y1', y);
    line.setAttribute('x2', width - padR); line.setAttribute('y2', y);
    line.setAttribute('stroke', 'var(--line)');
    svg.append(line);

    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', 4); txt.setAttribute('y', y + 4);
    txt.setAttribute('class', 'chart-axis');
    txt.textContent = Math.round(maxPts * ratio) + ' pt';
    svg.append(txt);
  });

  // Colonnes
  data.forEach((d, i) => {
    const xCenter = padL + (i + 0.5) * (innerW / data.length);
    const h = (d.points / maxPts) * innerH;
    const y = padT + (innerH - h);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', xCenter - colW / 2);
    rect.setAttribute('y', y);
    rect.setAttribute('width', colW);
    rect.setAttribute('height', Math.max(3, h));
    rect.setAttribute('rx', 4);
    rect.setAttribute('fill', 'var(--cyan)');
    svg.append(rect);

    // Valeur au-dessus
    const val = document.createElementNS(NS, 'text');
    val.setAttribute('x', xCenter);
    val.setAttribute('y', y - 5);
    val.setAttribute('text-anchor', 'middle');
    val.setAttribute('class', 'chart-value');
    val.textContent = '+' + d.points;
    svg.append(val);

    // Nom du mois en bas
    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('x', xCenter);
    lbl.setAttribute('y', height - 8);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('class', 'chart-label');
    lbl.textContent = d.label.split(' ')[0]; // premier mot (ex: août)
    svg.append(lbl);
  });

  return svg;
}

// ---------------------------------------------------------------------
// Détail et chargement de période
// ---------------------------------------------------------------------
function entry(e, isReversed, isRepaired) {
  const k = cat(e.category_id);
  const c = child(e.child_id);
  const parent = e.created_by ? '' : '';
  const meta = [parent, api.dayPartLabel(e.day_part), e.note].filter(Boolean).join(' · ');
  const label = (e.kind === 'booster' || e.kind === 'bonus_streak') ? 'Booster'
    : (k.label || (e.kind === 'reward' ? (e.note || 'Échange') : 'Écriture'));

  let cls = e.points > 0 ? 'pos' : (e.points < 0 ? 'neg' : '');
  if (e.kind === 'repair') cls = 'rep';

  return el('div', { class: 'entry' + (isReversed ? ' cancelled' : '') },
    el('span', { class: 'entry-dot', style: `background:${c?.color || 'var(--line)'}` }),
    el('div', { class: 'entry-main' },
      el('div', { class: 'entry-cat' }, label),
      meta ? el('div', { class: 'entry-meta' }, meta) : null),
    el('span', { class: 'entry-pts ' + cls }, pts(e.points)));
}

function openDay(day) {
  const rows = dailyMapFor(day);
  const list = events.filter(e => e.event_date === day && (!filter || e.child_id === filter));
  const flags = eventFlags(events);
  const body = el('div', {},
    el('div', { class: 'journal-modal-summaries' }, ...rows.map(({ child: c, stats }) =>
      el('div', { class: 'journal-modal-summary', style: `--kid:${c.color}` },
        avatar(c.first_name, { size: 'sm', customSrc: c.avatar, title: c.first_name }), el('b', {}, stats.score + ' pts'),
        el('span', {}, '+' + stats.gained + ' · −' + stats.lost + (stats.spent ? ' · dépensé ' + stats.spent : ''))))),
    list.length ? el('div', { class: 'journal-events' }, ...list.map(e => entry(e, flags.reversed.has(e.id), flags.repaired.has(e.id))))
      : el('p', { class: 'muted' }, 'Aucune écriture cette journée.'));
  modal(dayLabel(day), body, []);
}

async function loadPeriod() {
  try {
    let from, to;
    if (view === 'calendar') {
      from = monthStart(cursor);
      to = monthEnd(cursor);
    } else if (view === 'rewards') {
      from = '2020-01-01';
      to = api.todayISO();
    } else {
      // Vue Boosters
      if (boosterPeriod === 'week') {
        from = weekStart(cursor);
        to = weekEnd(cursor);
      } else if (boosterPeriod === 'month') {
        from = monthStart(cursor);
        to = monthEnd(cursor);
      } else if (boosterPeriod === 'year') {
        from = dateObj(cursor).getFullYear() + '-01-01';
        to = dateObj(cursor).getFullYear() + '-12-31';
      } else {
        from = boosterStartDate || addDays(api.todayISO(), -30);
        to = boosterEndDate || api.todayISO();
      }
    }

    [daily, events, cats, children] = await Promise.all([
      api.getDailyRange(from, to), api.getEventsRange(from, to), api.getCategoriesForHistory(), api.getChildren()
    ]);
    render();
  } catch (e) { fail(e); }
}

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

// ---------------------------------------------------------------------
// 3. Vue Récompenses (Historique des points dépensés et cadeaux obtenus)
// ---------------------------------------------------------------------
function renderRewardsView() {
  const flags = eventFlags(events);
  const rewardEvents = events.filter(e =>
    e.kind === 'reward' &&
    !flags.reversed.has(e.id) &&
    (!filter || e.child_id === filter));

  const totalSpent = rewardEvents.reduce((sum, e) => sum + Math.abs(Number(e.points || 0)), 0);

  return el('div', { class: 'journal-rewards-view' },
    el('div', { class: 'card', style: 'margin-bottom:14px;background:#fefce8;border-color:#fef08a' },
      el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
        el('div', {},
          el('h2', { style: 'margin:0;color:var(--navy)' }, 'Points dépensés en récompenses'),
          el('p', { class: 'muted', style: 'margin:2px 0 0' }, rewardEvents.length + ' récompense' + (rewardEvents.length > 1 ? 's' : '') + ' prise' + (rewardEvents.length > 1 ? 's' : ''))),
        el('div', { class: 'journal-booster-total', style: 'background:#fef08a;color:#854d0e' },
          el('strong', {}, '-' + totalSpent),
          el('span', {}, 'points')))),

    el('div', { class: 'card' },
      el('h2', {}, 'Historique des récompenses distribuées'),
      rewardEvents.length ? el('div', { class: 'journal-events', style: 'margin-top:12px' },
        ...rewardEvents.map(e => {
          const c = child(e.child_id);
          return el('div', { class: 'entry' },
            el('span', { class: 'entry-dot', style: `background:${c?.color || 'var(--line)'}` }),
            el('div', { class: 'entry-main' },
              el('div', { class: 'entry-cat' }, '🎁 ' + (e.note ? e.note.replace(/^Echange : /, '') : 'Récompense')),
              el('div', { class: 'entry-meta' }, avatar(c?.first_name || 'Enfant', { size: 'sm', customSrc: c?.avatar, title: c?.first_name || '' }), ' · ' + api.formatDate(e.event_date))),
            el('strong', { class: 'entry-pts neg' }, pts(e.points)),
            el('button', {
              class: 'btn btn-sm btn-danger',
              style: 'margin-left:8px',
              onclick: () => confirmCancelReward(e)
            }, 'Annuler'));
        }))
        : el('p', { class: 'muted' }, 'Aucune récompense prise sur cette période.')));
}

function confirmCancelReward(e) {
  const c = child(e.child_id);
  const rewardName = e.note ? e.note.replace(/^Echange : /, '') : 'Récompense';
  const refundPts = Math.abs(Number(e.points || 0));

  const body = el('div', {},
    el('p', { style: 'font-size:1rem;line-height:1.5' },
      'Veux-tu annuler cette récompense et restituer ',
      el('strong', {}, '+' + refundPts + ' points'), ' à ',
      el('strong', {}, c?.first_name || 'l\'enfant'), ' ?'),
    el('p', { class: 'muted', style: 'margin-top:8px' },
      'Une écriture inverse de restitution sera ajoutée au journal.'));

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
        await loadPeriod();
      } catch (err) { fail(err); }
    }
  }]);
}
