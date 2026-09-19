// =====================================================================
//  Reglages. Tout est modifiable ici : enfants, categories, bareme,
//  catalogue, jours speciaux. Rien n'est fige dans le code.
//  Seule regle : changer un bareme n'affecte que l'avenir.
// =====================================================================
import * as api from './api.js';
import { el, toast, fail, modal, personLabel } from './ui.js';

let root = null;
let children = [], cats = [], rewards = [], special = [], boosters = [], cinematic = null, famille = null, currentTheme = 'categories';
const ETALON = 22;                      // points par semaine et par enfant

const subs  = id => cats.filter(c => c.parent_id === id);
const roots = () => cats.filter(c => !c.parent_id);

async function reload() {
  [children, cats, rewards, special, boosters, cinematic] = await Promise.all([
    api.getChildren(), api.getCategories(), api.getRewards(), api.getSpecialDays(),
    api.getBoosterSettings(), api.getCinematicSettings()]);
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

  // Une catégorie peut être supprimée depuis ce formulaire. Si elle a déjà
  // servi, la base la retire des menus sans effacer le journal.


  const actions = [{
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
  }];
  if (cat) actions.push({
    label: 'Supprimer', class: 'btn-danger',
    onClick: async close => {
      const hasChildren = !cat.parent_id && subs(cat.id).length > 0;
      const cible = hasChildren ? 'cette catégorie et toutes ses sous-catégories' : 'cette catégorie';
      if (!window.confirm('Supprimer ' + cible + ' ?\n\nSi elle apparaît déjà dans l’historique, elle sera retirée des menus mais l’historique sera conservé.')) return;
      try {
        const mode = await api.deleteCategory(cat.id);
        close(); await reload();
        toast(mode === 'archived'
          ? 'Catégorie retirée des menus. Historique conservé.'
          : 'Catégorie supprimée.');
      } catch (e) { fail(e); }
    }
  });
  modal(cat ? 'Modifier la catégorie' : 'Nouvelle catégorie', body, actions);
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
  const app = root; app.innerHTML = '';
  app.append(el('h1', {}, 'Réglages'));

  // --- boutons de sélection thématiques (style Analyse, pas de débordement)
  const themes = [
    { id: 'categories', label: 'Catégories & barème' },
    { id: 'boosters',   label: 'Boosters' },
    { id: 'rewards',    label: 'Récompenses' },
    { id: 'system',     label: 'Options & effets' }
  ];

  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px' },
    ...themes.map(t => el('button', {
      class: 'chip' + (currentTheme === t.id ? ' on' : ''),
      onclick: () => { currentTheme = t.id; render(); }
    }, t.label))));

  if (currentTheme === 'categories') {
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
            el('td', { 'data-th': 'Prénom' }, personLabel(c.first_name, { size: 'sm' })),
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
      catBox.append(el('div', { style: 'margin-top:16px;padding-top:12px;border-top:1px solid var(--line)' },
        el('div', { class: 'row' },
          el('strong', {}, r.label),
          el('div', { class: 'spacer' }),
          el('button', { class: 'btn btn-sm', onclick: () => formCategorie(r) }, 'Modifier'),
          el('button', { class: 'btn btn-sm', onclick: () => formCategorie(null, r.id) }, '+ Sous-catégorie')),
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

  } else if (currentTheme === 'boosters') {
    // --- boosters calendaires
    function boosterForm(type, title, description, maxDays, setting) {
      const active = el('input', { type: 'checkbox', style: 'width:auto;min-height:auto', checked: setting?.active || false });
      const daily = el('input', { type: 'number', min: '0', step: '1', value: String(setting?.daily_min_points ?? 2) });
      const days = el('input', { type: 'number', min: '1', max: String(maxDays), step: '1', value: String(setting?.qualifying_days ?? (type === 'week' ? 5 : 20)) });
      const total = el('input', { type: 'number', min: '1', step: '1', value: String(setting?.total_min_points ?? (type === 'week' ? 18 : 70)) });
      const bonus = el('input', { type: 'number', min: '1', step: '1', value: String(setting?.bonus_points ?? 5) });
      const error = el('p', { class: 'error', hidden: true });
      const save = async () => {
        const d = Number(daily.value), n = Number(days.value), t = Number(total.value), b = Number(bonus.value);
        if (![d, n, t, b].every(Number.isInteger) || d < 0 || n < 1 || n > maxDays || t < 1 || b < 1) {
          error.hidden = false;
          error.textContent = 'Saisis des nombres entiers valides : jours entre 1 et ' + maxDays + ', points positifs.';
          return;
        }
        error.hidden = true;
        try {
          await api.save('booster_settings', {
            family_id: famille, period_type: type, active: active.checked,
            daily_min_points: d, qualifying_days: n, total_min_points: t, bonus_points: b,
            min_points: setting?.min_points ?? d, multiplier: setting?.multiplier ?? 1
          });
          await reload(); toast(title + ' enregistré.');
        } catch (e) { fail(e); }
      };
      return el('div', { class: 'card', style: 'margin-top:12px' },
        el('h3', {}, title),
        el('p', { class: 'muted', style: 'margin-top:-6px' }, description),
        el('label', { class: 'row', style: 'gap:8px;cursor:pointer' }, active,
          el('span', { style: 'font-weight:400;color:var(--ink)' }, 'Activer ce booster')),
        el('div', { class: 'fields' },
          champ('Minimum par jour', daily),
          champ('Nombre de jours minimum', days),
          champ('Total minimum sur la période', total),
          champ('Points du booster', bonus)),
        error,
        el('button', { class: 'btn btn-primary btn-sm', onclick: save }, 'Enregistrer'));
    }
    const weekBooster = boosters.find(b => b.period_type === 'week');
    const monthBooster = boosters.find(b => b.period_type === 'month');
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Boosters'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Chaque booster est évalué automatiquement à l’ouverture de l’application pour la dernière période complète. Les trois conditions doivent être remplies : seuil quotidien sur un nombre minimum de jours, puis total minimum de points sur toute la période.'),
      boosterForm('week', 'Booster semaine calendaire', 'Du lundi au dimanche. Exemple : au moins 2 points sur 5 jours et 18 points au total.', 7, weekBooster),
      boosterForm('month', 'Booster mois calendaire', 'Du premier au dernier jour du mois.', 31, monthBooster)));

  } else if (currentTheme === 'rewards') {
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

  } else if (currentTheme === 'system') {
    // --- cinématiques
    const fx1 = el('input', { type: 'number', min: '1', max: '999', value: String(cinematic?.level_1_min ?? 1) });
    const fx2 = el('input', { type: 'number', min: '2', max: '999', value: String(cinematic?.level_2_min ?? 5) });
    const fx3 = el('input', { type: 'number', min: '3', max: '999', value: String(cinematic?.level_3_min ?? 16) });
    const fxHelp = el('p', { class: 'muted' },
      'Les seuils s’appliquent aux points gagnés lors d’une seule saisie. Les malus ne déclenchent jamais de feu d’artifice.');
    const fxError = el('p', { class: 'error', hidden: true });
    const fxCard = el('div', { class: 'card' },
      el('h2', {}, 'Cinématiques de récompense'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Choisis à partir de combien de points chaque niveau d’effet se déclenche.'),
      el('div', { class: 'fields' },
        champ('Retour discret dès', fx1),
        champ('Pluie de particules dès', fx2),
        champ('Feu d’artifice dès', fx3)),
      fxHelp,
      fxError,
      el('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
        const a = Number(fx1.value), b = Number(fx2.value), c = Number(fx3.value);
        if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c) || a < 1 || b <= a || c <= b) {
          fxError.hidden = false;
          fxError.textContent = 'Les seuils doivent être des nombres entiers croissants : niveau 1 < niveau 2 < niveau 3.';
          return;
        }
        fxError.hidden = true;
        try {
          await api.save('cinematic_settings', {
            family_id: famille, level_1_min: a, level_2_min: b, level_3_min: c
          });
          cinematic = { family_id: famille, level_1_min: a, level_2_min: b, level_3_min: c };
          const mod = await import('./cinematics.js');
          mod.setCinematicThresholds(cinematic);
          toast('Seuils des cinématiques enregistrés.');
        } catch (e) { fail(e); }
      }}, 'Enregistrer les seuils'));
    app.append(fxCard);

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
  }
}
export async function mount(container, me) {
  root = container;
  famille = me.family_id;
  root.innerHTML = '<p class="muted">Chargement…</p>';
  try { await reload(); } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try { await reload(); } catch (e) { fail(e); }
}
