// =====================================================================
//  Reglages. Tout est modifiable ici : enfants, categories, bareme,
//  catalogue, jours speciaux. Rien n'est fige dans le code.
//  Seule regle : changer un bareme n'affecte que l'avenir.
// =====================================================================
import * as api from './api.js';
import { mountNav } from './nav.js';
import { $, el, toast, fail, modal } from './ui.js';

let children = [], cats = [], rewards = [], special = [], famille = null;
const ETALON = 22;                      // points par semaine et par enfant
const SYSTEME = ['Exceptionnel', 'Régularité', 'Ajustement'];

const subs  = id => cats.filter(c => c.parent_id === id);
const roots = () => cats.filter(c => !c.parent_id);

async function reload() {
  [children, cats, rewards, special] = await Promise.all([
    api.getChildren(), api.getCategories(), api.getRewards(), api.getSpecialDays()]);
  render();
}

// ---------------------------------------------------------------------
function champ(label, input) { return el('div', { class: 'field' }, el('label', {}, label), input); }

function formCategorie(cat, parentId) {
  const isSub = !!(cat ? cat.parent_id : parentId);
  const label = el('input', { type: 'text', value: cat?.label || '', required: true });
  const kind  = el('select', {},
    ...[['bonus', 'Bonus, on gagne des points'],
        ['malus', 'Malus, on en perd'],
        ['both',  'Les deux (catégorie chapeau)']]
      .map(([v, t]) => el('option', { value: v, selected: (cat?.kind || (isSub ? 'bonus' : 'both')) === v }, t)));
  const points = el('input', { type: 'number', min: '1', max: '50', value: String(cat?.default_points ?? 2) });
  const maxDay = el('input', { type: 'number', min: '1', max: '10', value: cat?.max_per_day ?? '', placeholder: 'illimité' });
  const rep    = el('input', { type: 'checkbox', style: 'width:auto;min-height:auto', checked: cat?.repairable || false });

  const body = el('div', {},
    champ('Libellé', label),
    el('div', { class: 'fields' },
      champ('Sens', kind),
      champ('Points par défaut', points),
      champ('Maximum par jour', maxDay)),
    el('label', { class: 'row', style: 'gap:8px;cursor:pointer' }, rep,
      el('span', { style: 'font-weight:400;color:var(--ink)' },
        'Réparable : l\'enfant peut récupérer la moitié en réparant')),
    el('p', { class: 'muted' },
      'Le barème ne change que pour les saisies à venir. Les points déjà donnés ne bougent pas.'));

  modal(cat ? 'Modifier la catégorie' : 'Nouvelle catégorie', body, [{
    label: 'Enregistrer', class: 'btn-primary',
    onClick: async close => {
      try {
        const row = {
          family_id: famille, parent_id: cat ? cat.parent_id : (parentId || null),
          label: label.value.trim(), kind: kind.value,
          default_points: Number(points.value),
          max_per_day: maxDay.value === '' ? null : Number(maxDay.value),
          repairable: rep.checked, active: cat?.active ?? true,
          sort_order: cat?.sort_order ?? 99
        };
        if (cat) row.id = cat.id;
        await api.save('categories', row);
        close(); await reload(); toast('Catégorie enregistrée.');
      } catch (e) { fail(e); }
    }
  }]);
}

function formRecompense(r) {
  const label = el('input', { type: 'text', value: r?.label || '', required: true });
  const scope = el('select', {}, ...[['individual', 'Pour un seul enfant'], ['collective', 'Pour toute la fratrie']]
    .map(([v, t]) => el('option', { value: v, selected: (r?.scope || 'individual') === v }, t)));
  const cost  = el('input', { type: 'number', min: '1', value: String(r?.cost ?? 60) });
  const minPc = el('input', { type: 'number', min: '0', value: String(r?.min_per_child ?? 0) });
  const desc  = el('input', { type: 'text', value: r?.description || '' });
  const jauge = el('p', { class: 'muted' });

  // Le calcul de calibration, affiche en direct. C'est le garde-fou
  // contre le cadeau a sept mois que personne n'atteindra jamais.
  const calibrer = () => {
    const c = Number(cost.value) || 0;
    const semaines = scope.value === 'collective'
      ? c / (ETALON * Math.max(1, children.length))
      : c / ETALON;
    const s = Math.round(semaines * 10) / 10;
    jauge.textContent = 'Environ ' + s + ' semaine' + (s > 1 ? 's' : '') + ' d\'attente à ' + ETALON + ' points par semaine.' +
      (s > 16 ? ' ⚠ Au-delà de 16 semaines, un enfant de 5 ans ne se projette plus : il se décourage.' : '');
    jauge.style.color = s > 16 ? 'var(--red)' : 'var(--muted)';
  };
  cost.addEventListener('input', calibrer);
  scope.addEventListener('change', calibrer);
  calibrer();

  const body = el('div', {},
    champ('Libellé', label),
    el('div', { class: 'fields' }, champ('Type', scope), champ('Prix en points', cost),
      champ('Minimum par enfant', minPc)),
    champ('Description', desc),
    jauge);

  modal(r ? 'Modifier la récompense' : 'Nouvelle récompense', body, [{
    label: 'Enregistrer', class: 'btn-primary',
    onClick: async close => {
      try {
        const row = {
          family_id: famille, label: label.value.trim(), scope: scope.value,
          cost: Number(cost.value), min_per_child: Number(minPc.value),
          description: desc.value, active: r?.active ?? true, sort_order: r?.sort_order ?? 99
        };
        if (r) row.id = r.id;
        await api.save('rewards', row);
        close(); await reload(); toast('Récompense enregistrée.');
      } catch (e) { fail(e); }
    }
  }]);
}

// ---------------------------------------------------------------------
function render() {
  const app = $('#app'); app.innerHTML = '';
  app.append(el('h1', {}, 'Réglages'));

  // --- enfants
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Enfants'),
    el('table', { class: 'responsive' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Prénom'), el('th', {}, 'Naissance'),
        el('th', {}, 'Objectif hebdo'), el('th', {}, 'Couleur'), el('th', {}, ''))),
      el('tbody', {}, ...children.map(c => {
        const b = el('input', { type: 'date', value: c.birth_date || '' });
        const g = el('input', { type: 'number', min: '5', max: '60', value: String(c.weekly_goal) });
        const col = el('input', { type: 'color', value: c.color, style: 'padding:2px;height:44px' });
        return el('tr', {},
          el('td', { 'data-th': 'Prénom' }, el('strong', {}, c.first_name)),
          el('td', { 'data-th': 'Naissance' }, b),
          el('td', { 'data-th': 'Objectif' }, g),
          el('td', { 'data-th': 'Couleur' }, col),
          el('td', { 'data-th': '' }, el('button', {
            class: 'btn btn-sm btn-primary', onclick: async () => {
              try {
                await api.save('children', { id: c.id, family_id: famille, first_name: c.first_name,
                  birth_date: b.value || null, weekly_goal: Number(g.value), color: col.value,
                  active: true, sort_order: c.sort_order });
                await reload(); toast('Enregistré.');
              } catch (e) { fail(e); }
            }
          }, 'Enregistrer')));
      })))));

  // --- categories
  const catBox = el('div', { class: 'card' },
    el('div', { class: 'row' }, el('h2', { style: 'margin:0' }, 'Catégories et barème'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm', onclick: () => formCategorie(null, null) }, '+ Grande catégorie')));
  roots().forEach(r => {
    const systeme = SYSTEME.includes(r.label);
    catBox.append(el('div', { style: 'margin-top:16px;padding-top:12px;border-top:1px solid var(--line)' },
      el('div', { class: 'row' },
        el('strong', {}, r.label),
        systeme ? el('span', { class: 'muted' }, '· catégorie système, ne pas renommer') : null,
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-sm', onclick: () => formCategorie(r) }, 'Modifier'),
        systeme ? null : el('button', { class: 'btn btn-sm', onclick: () => formCategorie(null, r.id) }, '+ Sous-catégorie')),
      el('div', { class: 'tiles', style: 'margin-top:10px' },
        ...subs(r.id).map(s => el('button', {
          class: 'tile ' + (s.kind === 'malus' ? 'tile-malus' : 'tile-bonus'),
          style: s.active ? '' : 'opacity:.45', onclick: () => formCategorie(s)
        },
          el('span', { class: 'tile-label' }, s.label),
          el('span', { class: 'tile-pts' },
            (s.kind === 'malus' ? '-' : '+') + s.default_points +
            (s.repairable ? ' · réparable' : '')))))));
  });
  app.append(catBox);

  // --- catalogue
  app.append(el('div', { class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:10px' },
      el('h2', { style: 'margin:0' }, 'Catalogue de récompenses'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm', onclick: () => formRecompense(null) }, '+ Récompense')),
    el('p', { class: 'muted', style: 'margin-top:-4px' },
      'Règle de calibration : prix = semaines d\'attente souhaitées × ' + ETALON + '.'),
    el('table', { class: 'responsive' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Récompense'), el('th', {}, 'Type'),
        el('th', {}, 'Prix'), el('th', {}, 'Min/enfant'), el('th', {}, 'Attente'), el('th', {}, ''))),
      el('tbody', {}, ...rewards.map(r => {
        const sem = Math.round((r.scope === 'collective' ? r.cost / (ETALON * children.length) : r.cost / ETALON) * 10) / 10;
        return el('tr', { style: r.active ? '' : 'opacity:.45' },
          el('td', { 'data-th': 'Récompense' }, r.label),
          el('td', { 'data-th': 'Type' }, r.scope === 'collective' ? 'Ensemble' : 'Individuel'),
          el('td', { 'data-th': 'Prix' }, r.cost + ' pts'),
          el('td', { 'data-th': 'Min/enfant' }, String(r.min_per_child)),
          el('td', { 'data-th': 'Attente' }, sem + ' sem.'),
          el('td', { 'data-th': '' }, el('button', { class: 'btn btn-sm', onclick: () => formRecompense(r) }, 'Modifier')));
      })))));

  // --- jours speciaux
  const jour = el('input', { type: 'date', value: api.todayISO() });
  const mult = el('input', { type: 'number', min: '1.5', max: '5', step: '0.5', value: '2' });
  const raison = el('input', { type: 'text', placeholder: 'Anniversaire, dernier jour d\'école…' });
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Jours spéciaux'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Le multiplicateur double les points gagnés. Il ne double jamais les malus : un jour de fête ne punit pas plus fort.'),
    el('div', { class: 'fields' }, champ('Date', jour), champ('Multiplicateur', mult), champ('Raison', raison)),
    el('button', {
      class: 'btn btn-primary btn-sm', onclick: async () => {
        try {
          await api.insert('special_days', {
            family_id: famille, day: jour.value,
            multiplier: Number(mult.value), reason: raison.value || 'Jour spécial'
          });
          raison.value = ''; await reload(); toast('Jour spécial ajouté.');
        } catch (e) { fail(e); }
      }
    }, 'Ajouter'),
    special.length ? el('table', { class: 'responsive', style: 'margin-top:14px' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Multiplicateur'), el('th', {}, 'Raison'), el('th', {}, ''))),
      el('tbody', {}, ...special.slice(0, 12).map(s => el('tr', {},
        el('td', { 'data-th': 'Date' }, api.formatDate(s.day)),
        el('td', { 'data-th': 'Multiplicateur' }, '×' + s.multiplier),
        el('td', { 'data-th': 'Raison' }, s.reason),
        el('td', { 'data-th': '' }, el('button', {
          class: 'btn btn-sm', onclick: async () => { await api.remove('special_days', s.id); await reload(); }
        }, 'Retirer')))))) : null));

  // --- bonus de regularite
  const lundi = (() => {
    const d = new Date(api.todayISO() + 'T12:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);          // lundi de la semaine passee
    return new Intl.DateTimeFormat('fr-CA').format(d);
  })();
  const semaine = el('input', { type: 'date', value: lundi });
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Bonus de régularité'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      "+5 points à chaque enfant ayant gagné au moins 2 points sur 5 jours de la semaine. " +
      "C'est l'horizon court dont le plus jeune a besoin : une semaine, pas trois mois. " +
      "À lancer le dimanche soir ou le lundi."),
    el('div', { class: 'row' }, champ('Lundi de la semaine', semaine),
      el('button', {
        class: 'btn btn-primary btn-sm', onclick: async () => {
          try {
            const n = await api.grantWeeklyStreak(semaine.value);
            toast(n === 0 ? 'Personne ne remplit la condition cette semaine.'
                          : n + ' bonus accordé' + (n > 1 ? 's' : '') + '.');
          } catch (e) { fail(e); }
        }
      }, 'Accorder'))));
}

(async function main() {
  const me = await mountNav();
  if (!me) return;
  famille = me.family_id;
  try { await reload(); } catch (e) { fail(e); }
})();
