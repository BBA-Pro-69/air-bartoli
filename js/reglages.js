// =====================================================================
//  Reglages. Tout est modifiable ici : enfants, categories, bareme,
//  catalogue, jours speciaux. Rien n'est fige dans le code.
//  Seule regle : changer un bareme n'affecte que l'avenir.
// =====================================================================
import * as api from './api.js';
import { el, toast, fail, modal, personLabel, openPhotoCropper, avatar } from './ui.js';

let root = null;
let children = [], cats = [], rewards = [], special = [], boosters = [], cinematic = null, contexts = [], parents = [], savingsSettings = null, balances = [], famille = null, currentTheme = 'categories';
const ETALON = 22;                      // points par semaine et par enfant

const subs  = id => cats.filter(c => c.parent_id === id);
const roots = () => cats.filter(c => !c.parent_id);

async function reload() {
  [children, cats, rewards, special, boosters, cinematic, contexts, parents, savingsSettings, balances] = await Promise.all([
    api.getChildren(), api.getCategories(), api.getRewards(), api.getSpecialDays(),
    api.getBoosterSettings(), api.getCinematicSettings(), api.getContexts().catch(() => []), api.getParents().catch(() => []),
    api.getSavingsSettings().catch(() => ({ annual_interest_rate: 12.00, active: true })),
    api.getBalances().catch(() => [])]);
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
  const points = el('input', { type: 'number', min: '0', max: '50', value: String(cat?.default_points ?? 2) });
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

  let currentImgUrl = r?.image_url || null;
  const imgPreview = el('div', { style: 'margin-bottom:12px;display:flex;align-items:center;gap:12px' },
    currentImgUrl ? el('img', { src: currentImgUrl, style: 'width:60px;height:60px;border-radius:12px;object-fit:cover;border:1px solid var(--line)' }) : null,
    el('button', {
      type: 'button',
      class: 'btn btn-sm',
      onclick: () => {
        openPhotoCropper({
          title: 'Photo de la récompense',
          isCircle: false,
          aspectRatio: 16 / 9,
          existingSrc: currentImgUrl,
          onSave: async blob => {
            const url = await api.uploadMedia(blob, 'reward');
            currentImgUrl = url;
            toast('Photo importée !');
            // Mettre à jour l'aperçu
            imgPreview.innerHTML = '';
            imgPreview.append(
              el('img', { src: url, style: 'width:60px;height:60px;border-radius:12px;object-fit:cover;border:1px solid var(--line)' }),
              el('span', { class: 'muted', style: 'font-size:.85rem' }, 'Photo prête'));
          }
        });
      }
    }, currentImgUrl ? 'Changer la photo' : '📷 Ajouter une photo'));

  const body = el('div', {},
    imgPreview,
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
          description: desc.value, active: r?.active ?? true, sort_order: r?.sort_order ?? 99,
          image_url: currentImgUrl
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
    { id: 'savings',    label: '🐷 Épargne & Tirelire' },
    { id: 'photos',     label: '📷 Gestion des photos' },
    { id: 'boosters',   label: 'Boosters' },
    { id: 'rewards',    label: 'Récompenses' },
    { id: 'system',     label: 'Options & effets' }
  ];

  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px' },
    ...themes.map(t => el('button', {
      class: 'chip' + (currentTheme === t.id ? ' on' : ''),
      onclick: () => { currentTheme = t.id; render(); }
    }, t.label))));


function renderSavingsSection(app) {
  // 1. Carte Taux d'intérêt annuel de la Tirelire Magique
  const rateInput = el('input', {
    type: 'number', step: '0.5', min: '0', max: '100',
    value: String(savingsSettings?.annual_interest_rate ?? 12.00)
  });

  const previewBox = el('div', { class: 'card', style: 'background:#fdf4ff;border-color:#f5d0fe;margin-top:12px' });
  const updatePreview = () => {
    const annual = Number(rateInput.value) || 0;
    const monthly = (annual / 12).toFixed(2);
    previewBox.innerHTML = '';
    previewBox.append(
      el('h3', { style: 'color:#a21caf;margin-top:0' }, 'Explication pédagogique en direct'),
      el('p', { style: 'margin:0 0 6px;font-size:.9rem' },
        'Un taux de ', el('strong', {}, annual + ' % par an'), ' équivaut à environ ',
        el('strong', {}, monthly + ' % par mois'), ' crédités le 1er jour du mois suivant.'),
      el('ul', { style: 'margin:0;padding-left:20px;font-size:.85rem;color:#701a75' },
        el('li', {}, 'Pour 50 points en Tirelire : +' + Math.round(50 * (annual / 100 / 12)) + ' point / mois'),
        el('li', {}, 'Pour 100 points en Tirelire : +' + Math.round(100 * (annual / 100 / 12)) + ' point(s) / mois'),
        el('li', {}, 'Pour 200 points en Tirelire : +' + Math.round(200 * (annual / 100 / 12)) + ' point(s) / mois'))
    );
  };
  rateInput.addEventListener('input', updatePreview);
  updatePreview();

  const rateCard = el('div', { class: 'card' },
    el('h2', {}, 'Taux d’intérêt de la Tirelire Magique (Famille)'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'L’argent placé sur la Tirelire Magique fait des petits. À la fin de chaque mois, les intérêts sont calculés et versés sur la tirelire.'),
    el('div', { class: 'fields' }, champ('Taux d’intérêt annuel (% / an)', rateInput)),
    previewBox,
    el('div', { class: 'row', style: 'margin-top:14px;gap:10px' },
      el('button', {
        class: 'btn btn-primary btn-sm',
        onclick: async () => {
          try {
            const annual = Number(rateInput.value);
            if (isNaN(annual) || annual < 0 || annual > 100) throw new Error('Taux invalide (0 à 100 %).');
            await api.save('savings_settings', {
              family_id: famille, annual_interest_rate: annual, active: true, updated_at: new Date().toISOString()
            });
            savingsSettings = { family_id: famille, annual_interest_rate: annual, active: true };
            toast('Taux d’intérêt de la Tirelire enregistré !');
            await reload();
          } catch (e) { fail(e); }
        }
      }, 'Enregistrer le taux'),
      el('button', {
        class: 'btn btn-sm',
        onclick: async () => {
          try {
            toast('Vérification des intérêts en cours…');
            const count = await api.applyMonthlyInterest();
            toast(count > 0 ? (count + ' versement(s) d’intérêts effectué(s) ! Bon vol.') : 'Tous les intérêts du mois écoulé sont déjà versés.');
            await reload();
          } catch (e) { fail(e); }
        }
      }, '🔄 Vérifier / Verser les intérêts maintenant'))
  );
  app.append(rateCard);

  // 2. Répartition par enfant
  const kidsCard = el('div', { class: 'card' },
    el('h2', {}, 'Répartition des points par enfant'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Pendant la journée, les points sont virtuels. À minuit, les points nets de la journée basculent en vrais points ventilés entre Portefeuille et Tirelire Magique.'),
    el('div', { style: 'display:grid;gap:14px' },
      ...children.map(c => {
        const bo = balances.find(x => x.child_id === c.id) || {};
        const curPct = c.savings_pct ?? 30;
        const slider = el('input', {
          type: 'range', min: '0', max: '100', step: '5', value: String(curPct),
          style: 'width:100%;cursor:pointer'
        });
        const pctLabel = el('strong', { style: 'font-size:1.1rem;color:#a21caf' }, curPct + ' %');
        const detailP = el('p', { class: 'muted', style: 'font-size:.82rem;margin:4px 0 0' });

        const updateChildDesc = () => {
          const sPct = Number(slider.value);
          const wPct = 100 - sPct;
          pctLabel.textContent = sPct + ' %';
          detailP.textContent = 'Chaque fin de journée : ' + wPct + ' % dans le Portefeuille 👛 et ' + sPct + ' % dans la Tirelire Magique 🐷✨.';
        };
        slider.addEventListener('input', updateChildDesc);
        updateChildDesc();

        return el('div', { style: 'border:1px solid var(--line);border-radius:14px;padding:14px;background:#fff' },
          el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px' },
            el('div', { style: 'display:flex;align-items:center;gap:10px' },
              avatar(c.first_name, { size: 'sm', customSrc: c.avatar, title: c.first_name }),
              el('strong', { style: 'font-size:1.05rem' }, c.first_name)),
            el('div', { style: 'display:flex;gap:6px;font-size:.78rem;font-weight:700' },
              el('span', { style: 'background:#f0f9ff;color:var(--cyan-d);padding:2px 8px;border-radius:6px;border:1px solid #bae6fd' }, '👛 ' + (bo.wallet_balance ?? 0) + ' pts'),
              el('span', { style: 'background:#fdf4ff;color:#a21caf;padding:2px 8px;border-radius:6px;border:1px solid #f5d0fe' }, '🐷 ' + (bo.savings_balance ?? 0) + ' pts'))),
          el('div', { style: 'margin:10px 0 6px' },
            el('div', { style: 'display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:4px' },
              el('span', {}, 'Part Tirelire Magique :'),
              pctLabel),
            slider,
            detailP),
          el('button', {
            class: 'btn btn-primary btn-sm', style: 'margin-top:10px',
            onclick: async () => {
              try {
                const sPct = Number(slider.value);
                await api.save('children', {
                  id: c.id, family_id: famille, first_name: c.first_name,
                  birth_date: c.birth_date, weekly_goal: c.weekly_goal,
                  savings_pct: sPct, color: c.color, active: true, sort_order: c.sort_order
                });
                c.savings_pct = sPct;
                toast('Répartition de ' + c.first_name + ' enregistrée !');
                await reload();
              } catch (e) { fail(e); }
            }
          }, 'Enregistrer la répartition pour ' + c.first_name));
      }))
  );
  app.append(kidsCard);
}

  if (currentTheme === 'categories') {
    // --- enfants
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Enfants'),
      el('table', { class: 'responsive' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Prénom'), el('th', {}, 'Naissance'),
          el('th', {}, 'Objectif hebdo'), el('th', {}, 'Part Tirelire'), el('th', {}, 'Couleur'), el('th', {}, ''))),
        el('tbody', {}, ...children.map(c => {
          const b = el('input', { type: 'date', value: c.birth_date || '' });
          const g = el('input', { type: 'number', min: '5', max: '60', value: String(c.weekly_goal) });
          const sav = el('input', { type: 'number', min: '0', max: '100', value: String(c.savings_pct ?? 30), style: 'width:70px' });
          const col = el('input', { type: 'color', value: c.color, style: 'padding:2px;height:44px' });
          return el('tr', {},
            el('td', { 'data-th': 'Photo' },
              el('button', {
                type: 'button',
                class: 'btn btn-sm',
                style: 'display:inline-flex;align-items:center;gap:8px;padding:4px 10px',
                title: 'Changer la photo de ' + c.first_name,
                onclick: () => {
                  openPhotoCropper({
                    title: 'Photo de ' + c.first_name,
                    isCircle: true,
                    existingSrc: c.avatar || null,
                    onSave: async blob => {
                      const url = await api.uploadMedia(blob, 'child_' + c.id);
                      await api.update('children', c.id, { avatar: url });
                      await reload();
                      toast('Photo de ' + c.first_name + ' mise à jour !');
                    }
                  });
                }
              },
                avatar(c.first_name, { size: 'xs', customSrc: c.avatar, title: c.first_name }),
                el('span', {}, c.first_name))),
            el('td', { 'data-th': 'Naissance' }, b),
            el('td', { 'data-th': 'Objectif' }, g),
            el('td', { 'data-th': 'Part Tirelire' }, el('div', { style: 'display:flex;align-items:center;gap:4px' }, sav, el('span', { class: 'muted' }, '%'))),
            el('td', { 'data-th': 'Couleur' }, col),
            el('td', { 'data-th': '' }, el('button', {
              class: 'btn btn-sm btn-primary', onclick: async () => {
                try {
                  await api.save('children', { id: c.id, family_id: famille, first_name: c.first_name,
                    birth_date: b.value || null, weekly_goal: Number(g.value), savings_pct: Number(sav.value), color: col.value,
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

  } else if (currentTheme === 'savings') {
    renderSavingsSection(app);
  } else if (currentTheme === 'photos') {
    // --- réglage interactif en direct des dimensions des photos
    const currentSaisiePx = parseInt(localStorage.getItem('air_avatar_size_saisie') || '76', 10);
    const currentRecPx = parseInt(localStorage.getItem('air_avatar_size_recompense') || '90', 10);

    const sliderSaisie = el('input', {
      type: 'range', min: '50', max: '110', step: '2', value: String(currentSaisiePx),
      style: 'width:100%;margin:8px 0'
    });
    const labelSaisieVal = el('strong', {}, currentSaisiePx + ' px');
    const previewSaisieAvatar = el('div', { class: 'kid-custom-avatar', style: 'margin:10px 0;display:flex;justify-content:center' },
      avatar(children[0]?.first_name || 'Aperçu', { size: 'xl', customSrc: children[0]?.avatar || null }));

    sliderSaisie.oninput = e => {
      const val = e.target.value;
      labelSaisieVal.textContent = val + ' px';
      document.documentElement.style.setProperty('--avatar-size-saisie', val + 'px');
      localStorage.setItem('air_avatar_size_saisie', val);
    };

    const sliderRec = el('input', {
      type: 'range', min: '60', max: '140', step: '2', value: String(currentRecPx),
      style: 'width:100%;margin:8px 0'
    });
    const labelRecVal = el('strong', {}, currentRecPx + ' px');
    const previewRecAvatar = el('div', { class: 'recompense-custom-avatar', style: 'margin:10px 0;display:flex;justify-content:center' },
      avatar(children[0]?.first_name || 'Aperçu', { size: 'xl', customSrc: children[0]?.avatar || null }));

    sliderRec.oninput = e => {
      const val = e.target.value;
      labelRecVal.textContent = val + ' px';
      document.documentElement.style.setProperty('--avatar-size-recompense', val + 'px');
      localStorage.setItem('air_avatar_size_recompense', val);
    };

    app.append(el('div', { class: 'card', style: 'border:2px solid var(--cyan);background:#f0fdf4' },
      el('h2', { style: 'color:var(--navy);display:flex;align-items:center;gap:8px' }, '📐 Dimensions des photos (réglage en direct)'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Ajuste la taille des photos avec le curseur. L\'aperçu en direct s\'actualise immédiatement et s\'applique à toute l\'application :'),
      el('div', { class: 'grid grid-2', style: 'margin-top:14px;gap:14px' },
        el('div', { class: 'card', style: 'background:#fff;margin-bottom:0;text-align:center' },
          el('h3', {}, 'Taille photo Saisie'),
          el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
            el('span', { class: 'muted', style: 'font-size:.85rem' }, 'Curseur'),
            labelSaisieVal),
          sliderSaisie,
          previewSaisieAvatar),
        el('div', { class: 'card', style: 'background:#fff;margin-bottom:0;text-align:center' },
          el('h3', {}, 'Taille photo Récompenses'),
          el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
            el('span', { class: 'muted', style: 'font-size:.85rem' }, 'Curseur'),
            labelRecVal),
          sliderRec,
          previewRecAvatar))));

    // --- hub de gestion centralisée des photos (enfants, parents, récompenses)
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Photos de profil des enfants'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Clique sur un enfant pour recadrer ou importer sa photo (cercle guide type LinkedIn) :'),
      el('div', { class: 'grid grid-2', style: 'margin-top:14px' },
        ...children.map(c => el('div', {
          class: 'card',
          style: `display:flex;align-items:center;gap:14px;margin-bottom:0;border-left:4px solid ${c.color}`
        },
          avatar(c.first_name, { size: 'lg', customSrc: c.avatar, title: c.first_name }),
          el('div', { style: 'flex:1;min-width:0' },
            el('strong', { style: 'font-size:1.05rem' }, c.first_name),
            el('div', { class: 'muted', style: 'font-size:.8rem' }, c.avatar ? 'Photo personnalisée' : 'Photo par défaut')),
          el('div', { class: 'row', style: 'gap:6px' },
            el('button', {
              type: 'button',
              class: 'btn btn-sm btn-primary',
              title: 'Recadrer la photo actuelle',
              onclick: () => {
                openPhotoCropper({
                  title: 'Cadrer la photo de ' + c.first_name,
                  isCircle: true,
                  existingSrc: c.avatar || null,
                  onSave: async blob => {
                    const url = await api.uploadMedia(blob, 'child_' + c.id);
                    await api.update('children', c.id, { avatar: url });
                    await reload();
                    toast('Photo de ' + c.first_name + ' mise à jour !');
                  }
                });
              }
            }, 'Cadrer'),
            el('button', {
              type: 'button',
              class: 'btn btn-sm',
              title: 'Choisir une nouvelle photo',
              onclick: () => {
                openPhotoCropper({
                  title: 'Nouvelle photo de ' + c.first_name,
                  isCircle: true,
                  existingSrc: null,
                  onSave: async blob => {
                    const url = await api.uploadMedia(blob, 'child_' + c.id);
                    await api.update('children', c.id, { avatar: url });
                    await reload();
                    toast('Nouvelle photo de ' + c.first_name + ' enregistrée !');
                  }
                });
              }
            }, 'Modifier')))))));

    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Photos des parents'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Personnalise les photos de profil des parents de la famille :'),
      el('div', { class: 'grid grid-2', style: 'margin-top:14px' },
        ...parents.map(p => el('div', {
          class: 'card',
          style: 'display:flex;align-items:center;gap:14px;margin-bottom:0'
        },
          avatar(p.display_name, { size: 'lg', customSrc: p.avatar_url, title: p.display_name }),
          el('div', { style: 'flex:1;min-width:0' },
            el('strong', { style: 'font-size:1.05rem' }, p.display_name),
            el('div', { class: 'muted', style: 'font-size:.8rem' }, p.avatar_url ? 'Photo personnalisée' : 'Photo par défaut')),
          el('div', { class: 'row', style: 'gap:6px' },
            el('button', {
              type: 'button',
              class: 'btn btn-sm btn-primary',
              title: 'Recadrer la photo actuelle',
              onclick: () => {
                openPhotoCropper({
                  title: 'Cadrer la photo de ' + p.display_name,
                  isCircle: true,
                  existingSrc: p.avatar_url || null,
                  onSave: async blob => {
                    const url = await api.uploadMedia(blob, 'parent_' + p.user_id);
                    await api.updateParentProfile({ avatar_url: url });
                    await reload();
                    toast('Photo de ' + p.display_name + ' mise à jour !');
                  }
                });
              }
            }, 'Cadrer'),
            el('button', {
              type: 'button',
              class: 'btn btn-sm',
              title: 'Choisir une nouvelle photo',
              onclick: () => {
                openPhotoCropper({
                  title: 'Nouvelle photo de ' + p.display_name,
                  isCircle: true,
                  existingSrc: null,
                  onSave: async blob => {
                    const url = await api.uploadMedia(blob, 'parent_' + p.user_id);
                    await api.updateParentProfile({ avatar_url: url });
                    await reload();
                    toast('Nouvelle photo de ' + p.display_name + ' enregistrée !');
                  }
                });
              }
            }, 'Modifier')))))));

    const rewardsWithImages = rewards.filter(r => r.active);
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Photos des récompenses du catalogue'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Associe une image cadrée pour chaque cadeau ou sortie collective :'),
      el('div', { class: 'grid grid-2', style: 'margin-top:14px' },
        ...rewardsWithImages.map(r => el('div', {
          class: 'card',
          style: 'display:flex;align-items:center;gap:14px;margin-bottom:0'
        },
          r.image_url
            ? el('img', { src: r.image_url, style: 'width:60px;height:60px;border-radius:12px;object-fit:cover;border:1px solid var(--line)' })
            : el('span', { style: 'width:60px;height:60px;border-radius:12px;background:#e2e8f0;display:grid;place-items:center;font-size:1.5rem' }, '🎁'),
          el('div', { style: 'flex:1;min-width:0' },
            el('strong', { style: 'font-size:.95rem' }, r.label),
            el('div', { class: 'muted', style: 'font-size:.8rem' }, r.cost + ' pts')),
          el('div', { class: 'row', style: 'gap:6px' },
            r.image_url ? el('button', {
              type: 'button',
              class: 'btn btn-sm btn-primary',
              title: 'Recadrer l\'image actuelle',
              onclick: () => {
                openPhotoCropper({
                  title: 'Cadrer : ' + r.label,
                  isCircle: false,
                  aspectRatio: 16 / 9,
                  existingSrc: r.image_url,
                  onSave: async blob => {
                    const url = await api.uploadMedia(blob, 'reward_' + r.id);
                    await api.update('rewards', r.id, { image_url: url });
                    await reload();
                    toast('Photo de récompense recadrée !');
                  }
                });
              }
            }, 'Cadrer') : null,
            el('button', {
              type: 'button',
              class: 'btn btn-sm',
              title: r.image_url ? 'Remplacer par une autre photo' : 'Importer une photo',
              onclick: () => {
                openPhotoCropper({
                  title: 'Photo : ' + r.label,
                  isCircle: false,
                  aspectRatio: 16 / 9,
                  existingSrc: null,
                  onSave: async blob => {
                    const url = await api.uploadMedia(blob, 'reward_' + r.id);
                    await api.update('rewards', r.id, { image_url: url });
                    await reload();
                    toast('Nouvelle photo de récompense enregistrée !');
                  }
                });
              }
            }, r.image_url ? 'Modifier' : 'Ajouter')))))));

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

    // --- contextes et moments personnalisés
    const newContextInput = el('input', { type: 'text', placeholder: 'Ex: Chez papi et mamie, Avec maman…' });
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Moments & contextes de journée'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Personnalise les moments proposés dans la liste déroulante lors de la saisie d\'une action.'),
      el('div', { class: 'row', style: 'gap:8px;margin-bottom:12px' },
        newContextInput,
        el('button', {
          class: 'btn btn-primary btn-sm', onclick: async () => {
            const val = newContextInput.value.trim();
            if (!val) return;
            try {
              await api.insert('custom_contexts', {
                family_id: famille, label: val, sort_order: contexts.length + 1
              });
              newContextInput.value = '';
              await reload();
              toast('Contexte ajouté.');
            } catch (e) { fail(e); }
          }
        }, 'Ajouter')),
      contexts.length ? el('div', { class: 'chips' },
        ...contexts.map(ctx => el('div', { class: 'chip', style: 'display:inline-flex;align-items:center;gap:8px' },
          el('span', {}, ctx.label),
          el('button', {
            type: 'button',
            style: 'border:0;background:transparent;cursor:pointer;color:var(--red);font-weight:700',
            onclick: async () => {
              try {
                await api.remove('custom_contexts', ctx.id);
                await reload();
                toast('Contexte retiré.');
              } catch (e) { fail(e); }
            }
          }, '×')))) : el('p', { class: 'muted' }, 'Aucun contexte configuré.')));

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
