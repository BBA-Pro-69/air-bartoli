// =====================================================================
//  Air Bartoli — Espace Réglages & Administration
//  5 onglets clairs et structurés :
//  1. 👨‍👩‍👧‍👦 Équipage & Famille (Enfants + Adultes avec photos & rôles)
//  2. 👛 Portefeuille & Tirelire (Répartition globale + par enfant, taux 100%)
//  3. 📋 Barème & Booster (Boosters régularité + Catégories école/maison)
//  4. 🎁 Récompenses (Catalogue, temps d'attente corrélé & historique dédié)
//  5. ⚙️ Système (Cinématiques, dimensions des photos enfant, PWA)
// =====================================================================
import * as api from './api.js';
import { el, toast, fail, modal, openPhotoCropper, avatar } from './ui.js';

let root = null;
let children = [], allChildren = [], cats = [], rewards = [], special = [], boosters = [], cinematic = null, contexts = [], parents = [], savingsSettings = null, balances = [], rewardRedemptions = [];
let famille = null;
let me = null;
let currentTheme = 'crew'; // 'crew' | 'savings' | 'categories' | 'rewards' | 'system'

async function reload() {
  const [allC, ct, rw, sp, bst, cin, ctx, pr, sav, bal, rRed] = await Promise.all([
    api.getAllChildren().catch(() => api.getChildren()),
    api.getCategories(),
    api.getRewards(),
    api.getSpecialDays(),
    api.getBoosterSettings(),
    api.getCinematicSettings(),
    api.getContexts().catch(() => []),
    api.getParents().catch(() => []),
    api.getSavingsSettings().catch(() => ({ annual_interest_rate: 100.00, active: true })),
    api.getBalances().catch(() => []),
    api.getRewardRedemptions().catch(() => [])
  ]);
  allChildren = allC;
  children = allChildren.filter(c => c.active !== false);
  cats = ct;
  rewards = rw;
  special = sp;
  boosters = bst;
  cinematic = cin;
  contexts = ctx;
  parents = pr;
  savingsSettings = sav;
  balances = bal;
  rewardRedemptions = rRed;
  render();
}

function champ(label, input) {
  return el('div', { class: 'field' }, el('label', {}, label), input);
}

const subs = id => cats.filter(c => c.parent_id === id);
const roots = () => cats.filter(c => !c.parent_id);

// ---------------------------------------------------------------------
// 1. ONGLET 1 : ÉQUIPAGE & FAMILLE
// ---------------------------------------------------------------------
function renderCrewSection(app) {
  const activeKids = allChildren.filter(c => c.active !== false);
  const archivedKids = allChildren.filter(c => c.active === false);

  // --- Section 1 : Les Enfants
  const kidsCard = el('div', { class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      el('h2', { style: 'margin:0' }, 'Les Enfants (' + activeKids.length + ')'),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn btn-sm btn-primary',
        onclick: () => openAddChildModal()
      }, '+ Ajouter un enfant')),
    el('table', { class: 'responsive' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Enfant'), el('th', {}, 'Naissance'),
        el('th', {}, 'Objectif hebdo'), el('th', {}, 'Part Tirelire'), el('th', {}, 'Couleur'), el('th', {}, 'Actions'))),
      el('tbody', {}, ...activeKids.map(c => {
        const b = el('input', { type: 'date', value: c.birth_date || '' });
        const g = el('input', { type: 'number', min: '5', max: '100', value: String(c.weekly_goal || 42) });
        const sav = el('input', { type: 'number', min: '0', max: '100', value: String(c.savings_pct ?? 70), style: 'width:65px' });
        const col = el('input', { type: 'color', value: c.color, style: 'padding:2px;height:40px;width:50px' });
        return el('tr', {},
          el('td', { 'data-th': 'Enfant' },
            el('button', {
              type: 'button', class: 'btn btn-sm',
              style: 'display:inline-flex;align-items:center;gap:8px;padding:4px 10px',
              title: 'Changer la photo de ' + c.first_name,
              onclick: () => {
                openPhotoCropper({
                  title: 'Photo de ' + c.first_name,
                  isCircle: true, existingSrc: c.avatar || null,
                  onSave: async blob => {
                    const url = await api.uploadMedia(blob, 'child_' + c.id);
                    await api.update('children', c.id, { avatar: url });
                    await reload(); toast('Photo de ' + c.first_name + ' mise à jour !');
                  }
                });
              }
            },
              avatar(c.first_name, { size: 'xs', customSrc: c.avatar, title: c.first_name }),
              el('strong', {}, c.first_name))),
          el('td', { 'data-th': 'Naissance' }, b),
          el('td', { 'data-th': 'Objectif' }, g),
          el('td', { 'data-th': 'Part Tirelire' }, el('div', { style: 'display:flex;align-items:center;gap:4px' }, sav, el('span', { class: 'muted' }, '%'))),
          el('td', { 'data-th': 'Couleur' }, col),
          el('td', { 'data-th': 'Actions' },
            el('div', { class: 'row', style: 'gap:6px' },
              el('button', {
                class: 'btn btn-sm btn-primary', onclick: async () => {
                  try {
                    await api.save('children', {
                      id: c.id, family_id: famille, first_name: c.first_name,
                      birth_date: b.value || null, weekly_goal: Number(g.value),
                      savings_pct: Number(sav.value), color: col.value,
                      active: true, sort_order: c.sort_order
                    });
                    await reload(); toast('Enfant mis à jour.');
                  } catch (e) { fail(e); }
                }
              }, 'Enregistrer'),
              el('button', {
                class: 'btn btn-sm btn-ghost', style: 'color:var(--red)',
                title: 'Archiver l’enfant sans supprimer son historique',
                onclick: async () => {
                  if (!window.confirm('Archiver ' + c.first_name + ' ?\n\nIl ne sera plus affiché sur la saisie rapide, mais tout son historique de points restera précieusement conservé.')) return;
                  try {
                    await api.archiveChild(c.id);
                    await reload(); toast(c.first_name + ' archivé.');
                  } catch (e) { fail(e); }
                }
              }, 'Archiver'))));
      }))));

  if (archivedKids.length) {
    kidsCard.append(
      el('div', { style: 'margin-top:16px;padding-top:12px;border-top:1px solid var(--line)' },
        el('h3', { class: 'muted', style: 'margin:0 0 10px' }, 'Enfants archivés (' + archivedKids.length + ')'),
        el('div', { style: 'display:grid;gap:8px' },
          ...archivedKids.map(k => el('div', { class: 'row', style: 'background:#f8fafc;padding:8px 12px;border-radius:10px' },
            avatar(k.first_name, { size: 'xs', customSrc: k.avatar }),
            el('span', {}, k.first_name),
            el('span', { class: 'muted', style: 'font-size:.8rem' }, 'Archivé'),
            el('div', { class: 'spacer' }),
            el('button', {
              class: 'btn btn-sm',
              onclick: async () => {
                await api.restoreChild(k.id);
                await reload(); toast(k.first_name + ' réactivé !');
              }
            }, 'Réactiver'))))));
  }
  app.append(kidsCard);

  // --- Section 2 : Les Adultes / Équipage élargi
  const parentsCard = el('div', { class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      el('h2', { style: 'margin:0' }, 'Les Adultes de l’équipage (' + parents.length + ')'),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn btn-sm btn-primary',
        onclick: () => openAddCrewModal()
      }, '+ Inviter un membre')),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Chaque adulte peut avoir sa photo personnalisée. Les Parents administrateurs gèrent toute l’application, tandis que les membres d’équipage (grands-parents, nounou, tonton/tata) notent les enfants sans accès aux réglages.'),
    el('div', { style: 'display:grid;gap:10px;margin-top:12px' },
      ...parents.map(p => {
        const isAdmin = p.is_admin === true;
        const isMe = p.user_id === me?.user_id;

        return el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff' },
          el('div', { style: 'display:flex;align-items:center;gap:12px' },
            el('button', {
              type: 'button', class: 'btn btn-sm',
              style: 'padding:2px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--line)',
              title: 'Modifier la photo de ' + p.display_name,
              onclick: () => {
                openPhotoCropper({
                  title: 'Photo de ' + p.display_name,
                  isCircle: true,
                  existingSrc: p.avatar_url || null,
                  onSave: async blob => {
                    const url = await api.uploadMedia(blob, 'parent_' + p.user_id);
                    await api.updateCrewMember(p.user_id, p.display_name, p.role_title, url, p.email);
                    await reload();
                    toast('Photo de ' + p.display_name + ' mise à jour !');
                  }
                });
              }
            }, avatar(p.display_name, { size: 'sm', customSrc: p.avatar_url })),
            el('div', {},
              el('div', { style: 'display:flex;align-items:center;gap:8px' },
                el('strong', {}, p.display_name),
                isMe ? el('span', { class: 'muted', style: 'font-size:.76rem;font-weight:700' }, '(Vous)') : null,
                el('span', {
                  class: 'badge',
                  style: isAdmin ? 'background:#e0f2fe;color:var(--cyan-d);font-size:.72rem' : 'background:#f1f5f9;color:var(--muted);font-size:.72rem'
                }, isAdmin ? '★ Parent Admin' : (p.role_title || 'Membre d’équipage'))),
              el('span', { class: 'muted', style: 'font-size:.8rem' }, p.email || 'Email non renseigné'))),
          el('div', { class: 'row', style: 'gap:6px' },
            el('button', {
              class: 'btn btn-sm',
              onclick: () => openEditCrewModal(p)
            }, 'Modifier'),
            !isMe ? el('button', {
              class: 'btn btn-sm btn-ghost', style: 'color:var(--red)',
              onclick: async () => {
                if (!window.confirm('Supprimer ' + p.display_name + ' de l’équipage ?\n\nSon accès sera immédiatement révoqué.')) return;
                try {
                  await api.removeCrewMember(p.user_id);
                  await reload(); toast(p.display_name + ' retiré de l’équipage.');
                } catch (e) { fail(e); }
              }
            }, 'Supprimer') : null));
      }))
  );
  app.append(parentsCard);
}

function openEditCrewModal(p) {
  const nameInput = el('input', { type: 'text', value: p.display_name || '', required: true });
  const roleInput = el('input', { type: 'text', value: p.role_title || (p.is_admin ? 'Parent' : 'Membre d’équipage') });
  const emailInput = el('input', { type: 'email', value: p.email || '' });

  const body = el('div', {},
    champ('Prénom / Nom d’usage', nameInput),
    champ('Rôle affiché', roleInput),
    champ('Adresse email', emailInput));

  modal('Modifier le profil de ' + p.display_name, body, [{
    label: 'Enregistrer', class: 'btn-primary',
    onClick: async close => {
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error('Le prénom est obligatoire.');
        await api.updateCrewMember(p.user_id, name, roleInput.value.trim(), null, emailInput.value.trim());
        close(); await reload(); toast('Profil mis à jour !');
      } catch (e) { fail(e); }
    }
  }]);
}

function openAddChildModal() {
  const nameInput = el('input', { type: 'text', placeholder: 'Prénom de l’enfant', required: true });
  const birthInput = el('input', { type: 'date' });
  const goalInput = el('input', { type: 'number', min: '5', max: '100', value: '42' });
  const savInput = el('input', { type: 'number', min: '0', max: '100', value: '70' });
  const colorInput = el('input', { type: 'color', value: '#00A7E1', style: 'height:44px' });
  let childAvatarUrl = null;

  const avatarBox = el('div', { style: 'margin-bottom:12px;display:flex;align-items:center;gap:12px' },
    el('button', {
      type: 'button', class: 'btn btn-sm',
      onclick: () => {
        openPhotoCropper({
          title: 'Photo de l’enfant', isCircle: true,
          onSave: async blob => {
            childAvatarUrl = await api.uploadMedia(blob, 'new_child');
            toast('Photo prête !');
          }
        });
      }
    }, '📷 Choisir une photo'));

  const body = el('div', {},
    avatarBox,
    champ('Prénom', nameInput),
    champ('Date de naissance', birthInput),
    el('div', { class: 'fields' },
      champ('Objectif hebdo (points/semaine)', goalInput),
      champ('Part Tirelire Magique (%)', savInput),
      champ('Couleur', colorInput)),
    el('p', { class: 'muted' }, 'Objectif standard : 42 points par semaine (3 pts/jour d’école, 10 pts le week-end). Répartition recommandée : 70 % en Tirelire Magique.'));

  modal('Ajouter un enfant à l’équipage', body, [{
    label: 'Créer le profil', class: 'btn-primary',
    onClick: async close => {
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error('Le prénom est obligatoire.');
        await api.insert('children', {
          family_id: famille, first_name: name,
          birth_date: birthInput.value || null,
          weekly_goal: Number(goalInput.value) || 42,
          savings_pct: Number(savInput.value) || 70,
          color: colorInput.value, avatar: childAvatarUrl,
          active: true, sort_order: children.length + 1
        });
        close(); await reload(); toast('Enfant ajouté avec succès !');
      } catch (e) { fail(e); }
    }
  }]);
}

function openAddCrewModal() {
  const nameInput = el('input', { type: 'text', placeholder: 'Ex: Nounou Sophie, Papy Jean', required: true });
  const roleInput = el('select', {},
    el('option', { value: 'Grand-parent' }, 'Grand-parent'),
    el('option', { value: 'Nounou' }, 'Nounou / Babysitter'),
    el('option', { value: 'Tonton / Tata' }, 'Tonton / Tata'),
    el('option', { value: 'Membre d’équipage' }, 'Autre proche'));
  const emailInput = el('input', { type: 'email', placeholder: 'adresse@gmail.com', required: true });
  const pwdInput = el('input', { type: 'password', placeholder: 'Mot de passe (min 6 caractères)', required: true });

  const body = el('div', {},
    champ('Prénom / Nom d’usage', nameInput),
    champ('Rôle dans la famille', roleInput),
    champ('Adresse email (pour la connexion)', emailInput),
    champ('Mot de passe initial', pwdInput),
    el('p', { class: 'muted' },
      'Ce compte aura un accès d’équipage : il pourra saisir des points au quotidien et consulter les scores, mais n’aura aucun droit d’administration sur le barème ou les réglages.'));

  modal('Inviter un membre d’équipage', body, [{
    label: 'Créer l’accès', class: 'btn-primary',
    onClick: async close => {
      try {
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const pwd = pwdInput.value;
        if (!name || !email || !pwd) throw new Error('Tous les champs sont requis.');
        if (pwd.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères.');
        await api.createCrewMember(email, pwd, name, roleInput.value);
        close(); await reload(); toast('Accès créé pour ' + name + ' !');
      } catch (e) { fail(e); }
    }
  }]);
}

// ---------------------------------------------------------------------
// 2. ONGLET 2 : PORTEFEUILLE & TIRELIRE
// ---------------------------------------------------------------------
function renderSavingsSection(app) {
  // 1. Paramétrage des intérêts
  const rateInput = el('input', {
    type: 'number', step: '5', min: '0', max: '200',
    value: String(savingsSettings?.annual_interest_rate ?? 100.00)
  });

  const previewBox = el('div', { class: 'card', style: 'background:#fdf4ff;border-color:#f5d0fe;margin-top:12px' });
  const updatePreview = () => {
    const annual = Number(rateInput.value) || 0;
    const monthly = (annual / 12).toFixed(2);
    previewBox.innerHTML = '';
    previewBox.append(
      el('h3', { style: 'color:#a21caf;margin-top:0' }, 'Simulation pédagogique des intérêts'),
      el('p', { style: 'margin:0 0 6px;font-size:.9rem' },
        'Taux annuel : ', el('strong', {}, annual + ' % / an'), ' (soit environ ',
        el('strong', {}, monthly + ' % par mois'), ' versés le 1er de chaque mois).'),
      el('ul', { style: 'margin:0;padding-left:20px;font-size:.85rem;color:#701a75' },
        el('li', {}, 'Pour 25 points en Tirelire : +' + Math.round(25 * (annual / 100 / 12)) + ' point(s) / mois'),
        el('li', {}, 'Pour 50 points en Tirelire : +' + Math.round(50 * (annual / 100 / 12)) + ' point(s) / mois'),
        el('li', {}, 'Pour 100 points en Tirelire : +' + Math.round(100 * (annual / 100 / 12)) + ' point(s) / mois'),
        el('li', {}, 'Pour 200 points en Tirelire : +' + Math.round(200 * (annual / 100 / 12)) + ' point(s) / mois'))
    );
  };
  rateInput.addEventListener('input', updatePreview);
  updatePreview();

  const rateCard = el('div', { class: 'card' },
    el('h2', {}, 'Taux d’intérêt annuel de la Tirelire Magique'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'L’argent placé sur la Tirelire Magique fait des petits. À la fin de chaque mois, les intérêts sont calculés et versés sur la tirelire pour inciter à l’épargne long terme.'),
    el('div', { class: 'fields' }, champ('Taux d’intérêt annuel (% / an)', rateInput)),
    previewBox,
    el('div', { class: 'row', style: 'margin-top:14px;gap:10px' },
      el('button', {
        class: 'btn btn-primary btn-sm',
        onclick: async () => {
          try {
            const annual = Number(rateInput.value);
            if (isNaN(annual) || annual < 0 || annual > 200) throw new Error('Taux invalide (0 à 200 %).');
            await api.save('savings_settings', {
              family_id: famille, annual_interest_rate: annual, active: true, updated_at: new Date().toISOString()
            });
            savingsSettings = { family_id: famille, annual_interest_rate: annual, active: true };
            toast('Taux d’intérêt enregistré !');
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
            toast(count > 0 ? (count + ' versement(s) d’intérêts effectué(s) !') : 'Les intérêts du mois écoulé sont déjà versés.');
            await reload();
          } catch (e) { fail(e); }
        }
      }, '🔄 Vérifier / Verser les intérêts maintenant'))
  );
  app.append(rateCard);

  // 2. Réglage global pour toute la fratrie
  const globalPct = 70;
  const globalSlider = el('input', {
    type: 'range', min: '0', max: '100', step: '5', value: String(globalPct),
    style: 'width:100%;cursor:pointer'
  });
  const globalLabel = el('strong', { style: 'font-size:1.15rem;color:#a21caf' }, globalPct + ' %');
  const globalDesc = el('p', { class: 'muted', style: 'font-size:.85rem;margin:4px 0 10px' });

  const updateGlobalDesc = () => {
    const s = Number(globalSlider.value);
    const w = 100 - s;
    globalLabel.textContent = s + ' % Tirelire / ' + w + ' % Portefeuille';
    globalDesc.textContent = 'Applique d’un coup la règle suivante à tous les enfants : ' + w + ' % dans le Portefeuille 👛 et ' + s + ' % dans la Tirelire Magique 🐷✨.';
  };
  globalSlider.addEventListener('input', updateGlobalDesc);
  updateGlobalDesc();

  const globalCard = el('div', { class: 'card', style: 'background:#faf5ff;border-color:#e9d5ff' },
    el('h2', { style: 'color:#6b21a8' }, '⚡ Réglage global pour toute la fratrie'),
    el('p', { class: 'muted', style: 'margin-top:-6px' }, 'Permet de définir en un seul clic la même clé de répartition pour tous les enfants.'),
    el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px' },
      el('span', { style: 'font-weight:700' }, 'Part Tirelire Magique commune :'),
      globalLabel),
    globalSlider,
    globalDesc,
    el('button', {
      class: 'btn btn-primary btn-sm',
      onclick: async () => {
        try {
          const sPct = Number(globalSlider.value);
          await Promise.all(children.map(c =>
            api.save('children', {
              id: c.id, family_id: famille, first_name: c.first_name,
              birth_date: c.birth_date, weekly_goal: c.weekly_goal,
              savings_pct: sPct, color: c.color, active: true, sort_order: c.sort_order
            })
          ));
          toast('Répartition globale appliquée à tous les enfants (' + sPct + ' % Tirelire) !');
          await reload();
        } catch (e) { fail(e); }
      }
    }, '⚡ Appliquer à tous les enfants'));
  app.append(globalCard);

  // 3. Répartition individuelle enfant par enfant
  const kidsCard = el('div', { class: 'card' },
    el('h2', {}, 'Ajustements individuels enfant par enfant'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Chaque soir à minuit, les points nets de la journée basculent du statut virtuel vers les vrais points, répartis selon le curseur de chaque enfant.'),
    el('div', { style: 'display:grid;gap:14px;margin-top:10px' },
      ...children.map(c => {
        const bo = balances.find(x => x.child_id === c.id) || {};
        const curPct = c.savings_pct ?? 70;
        const slider = el('input', {
          type: 'range', min: '0', max: '100', step: '5', value: String(curPct),
          style: 'width:100%;cursor:pointer'
        });
        const pctLabel = el('strong', { style: 'font-size:1.1rem;color:#a21caf' }, curPct + ' %');
        const detailP = el('p', { class: 'muted', style: 'font-size:.84rem;margin:4px 0 0' });

        const updateChildDesc = () => {
          const sPct = Number(slider.value);
          const wPct = 100 - sPct;
          pctLabel.textContent = sPct + ' %';
          detailP.textContent = 'Bascule de minuit : ' + wPct + ' % dans le Portefeuille 👛 et ' + sPct + ' % dans la Tirelire Magique 🐷✨.';
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
              el('span', {}, 'Part Tirelire Magique (épargne) :'),
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
          }, 'Enregistrer pour ' + c.first_name));
      }))
  );
  app.append(kidsCard);
}

// ---------------------------------------------------------------------
// 3. ONGLET 3 : BARÈME & BOOSTER
// ---------------------------------------------------------------------
function renderBaremeSection(app) {
  // Boosters calendaires
  const weekBooster = boosters.find(b => b.period_type === 'week');
  const monthBooster = boosters.find(b => b.period_type === 'month');

  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Boosters de régularité'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Un bonus accordé quand l’enfant valide un nombre de jours réguliers et un total de points sur la période.'),
    el('div', { class: 'grid grid-2' },
      boosterForm('week', 'Booster semaine calendaire', 'Du lundi au dimanche.', 7, weekBooster),
      boosterForm('month', 'Booster mois calendaire', 'Du premier au dernier jour du mois.', 31, monthBooster))));

  // Catégories & Barème
  const catBox = el('div', { class: 'card' },
    el('div', { class: 'row' },
      el('h2', { style: 'margin:0' }, 'Catégories et barème de points'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm btn-primary', onclick: () => formCategorie(null, null) }, '+ Grande catégorie')),
    el('p', { class: 'muted', style: 'margin-top:4px' },
      'Étalon de référence recommandé : 3 points par jour avec école (~12 pts/semaine), 10 points par jour sans école (~30 pts/week-end), soit un total de 42 points par semaine.'));

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
}

function boosterForm(periodType, title, desc, maxDays, current) {
  const activeInput = el('input', { type: 'checkbox', style: 'width:auto;min-height:auto', checked: current?.active || false });
  const dailyInput = el('input', { type: 'number', min: '1', max: '30', value: String(current?.daily_min_points || (periodType === 'week' ? 2 : 2)) });
  const daysInput = el('input', { type: 'number', min: '1', max: String(maxDays), value: String(current?.qualifying_days || (periodType === 'week' ? 5 : 20)) });
  const totalInput = el('input', { type: 'number', min: '1', max: '300', value: String(current?.total_min_points || (periodType === 'week' ? 18 : 75)) });
  const bonusInput = el('input', { type: 'number', min: '1', max: '100', value: String(current?.bonus_points || (periodType === 'week' ? 5 : 20)) });

  return el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:14px;background:#fff' },
    el('label', { class: 'row', style: 'gap:8px;cursor:pointer;margin-bottom:8px' }, activeInput, el('strong', {}, title)),
    el('p', { class: 'muted', style: 'font-size:.82rem;margin:0 0 10px' }, desc),
    el('div', { class: 'fields' },
      champ('Au moins (pts/jour)', dailyInput),
      champ('Sur au moins (jours)', daysInput),
      champ('Total requis (points)', totalInput),
      champ('Bonus accordé (points)', bonusInput)),
    el('button', {
      class: 'btn btn-primary btn-sm', style: 'margin-top:10px',
      onclick: async () => {
        try {
          await api.save('booster_settings', {
            family_id: famille, period_type: periodType,
            active: activeInput.checked,
            daily_min_points: Number(dailyInput.value),
            qualifying_days: Number(daysInput.value),
            total_min_points: Number(totalInput.value),
            bonus_points: Number(bonusInput.value),
            multiplier: 1.0, updated_at: new Date().toISOString()
          });
          toast(title + ' enregistré !');
          await reload();
        } catch (e) { fail(e); }
      }
    }, 'Enregistrer ce booster'));
}

// ---------------------------------------------------------------------
// 4. ONGLET 4 : RÉCOMPENSES
// ---------------------------------------------------------------------
function renderRewardsSection(app) {
  const activeKids = children.filter(k => k.active !== false);
  const meanGoal = activeKids.length ? (activeKids.reduce((s, k) => s + (k.weekly_goal || 42), 0) / activeKids.length) : 42;
  const meanSavingsPct = activeKids.length ? (activeKids.reduce((s, k) => s + (k.savings_pct ?? 70), 0) / activeKids.length) : 70;

  // Calcul du flux portefeuille individuel (30% de 42 = ~12.6 pts/semaine)
  const fluxPortefeuille = meanGoal * (1 - (meanSavingsPct / 100.0));
  // Calcul du flux tirelire collective pour toute la fratrie (70% de 84 = ~58.8 pts/semaine)
  const fluxTirelire = activeKids.reduce((s, k) => s + ((k.weekly_goal || 42) * ((k.savings_pct ?? 70) / 100.0)), 0);

  app.append(el('div', { class: 'card' },
    el('div', { class: 'row', style: 'margin-bottom:12px' },
      el('h2', { style: 'margin:0' }, 'Catalogue des récompenses (' + rewards.length + ')'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm btn-primary', onclick: () => formRecompense(null) }, '+ Nouvelle récompense')),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Les récompenses individuelles sont payées par le Portefeuille 👛. Les sorties collectives sont payées par la Tirelire Magique 🐷✨. Les temps d’attente sont calculés en direct selon les objectifs hebdomadaires réels des enfants.'),
    el('div', { class: 'rewards', style: 'margin-top:14px' },
      ...rewards.map(r => {
        const isCollective = r.scope === 'collective';
        const flux = isCollective ? fluxTirelire : fluxPortefeuille;
        const semaines = flux > 0 ? (Math.round((r.cost / flux) * 10) / 10) : 0;
        const descTemps = isCollective
          ? '~' + semaines + ' semaine' + (semaines > 1 ? 's' : '') + ' pour la fratrie'
          : '~' + semaines + ' semaine' + (semaines > 1 ? 's' : '') + ' par enfant';

        // Historique des attributions de cette récompense
        const historyList = rewardRedemptions.filter(e => {
          const mId = e.redemptions?.reward_id === r.id;
          const mNote = e.note && e.note.includes(r.label);
          return mId || mNote;
        });
        const distCount = historyList.length;

        return el('div', { class: 'reward' },
          r.image_url ? el('img', { src: r.image_url, class: 'reward-img' }) : null,
          el('div', { class: 'reward-top' },
            el('div', {},
              el('strong', {}, r.label),
              el('div', { style: 'font-size:.74rem;font-weight:700;margin-top:2px;color:' + (isCollective ? '#a21caf' : 'var(--cyan-d)') },
                isCollective ? '🐷 Tirelire Magique (Collectif)' : '👛 Portefeuille (Individuel)')),
            el('span', { class: 'reward-cost' }, r.cost + ' pts')),
          el('div', { style: 'margin:8px 0;display:flex;flex-direction:column;gap:3px;font-size:.82rem' },
            el('div', { style: 'font-weight:600;color:var(--navy)' }, '⏳ ' + descTemps),
            el('div', { class: 'muted' },
              isCollective ? 'Minimum : ' + r.min_per_child + ' pts par enfant' : 'Dépense libre sur le portefeuille personnel'),
            el('div', { style: 'font-weight:700;color:var(--ink);margin-top:2px' },
              distCount > 0 ? ('🎁 Distribuée ' + distCount + ' fois') : '🎁 Pas encore attribuée')),
          el('div', { class: 'row', style: 'margin-top:10px;gap:6px' },
            el('button', {
              class: 'btn btn-sm btn-ghost',
              style: 'border:1px solid var(--line);font-weight:600',
              title: 'Voir l’historique des attributions',
              onclick: () => openRewardHistoryModal(r, historyList)
            }, '📜 Historique (' + distCount + ')'),
            el('button', { class: 'btn btn-sm', onclick: () => formRecompense(r) }, 'Modifier'),
            el('button', {
              class: 'btn btn-sm btn-ghost', style: 'color:var(--red)',
              onclick: async () => {
                if (!window.confirm('Supprimer ' + r.label + ' ?')) return;
                await api.remove('rewards', r.id);
                await reload(); toast('Récompense supprimée.');
              }
            }, 'Supprimer')));
      }))
  ));
}

function openRewardHistoryModal(r, historyList) {
  const isCollective = r.scope === 'collective';
  const headerCard = el('div', { style: 'display:flex;align-items:center;gap:14px;padding:12px;background:#f8fafc;border-radius:12px;margin-bottom:14px' },
    r.image_url ? el('img', { src: r.image_url, style: 'width:80px;height:45px;border-radius:8px;object-fit:cover' }) : null,
    el('div', {},
      el('strong', { style: 'font-size:1.1rem;display:block' }, r.label),
      el('span', { class: 'muted', style: 'font-size:.85rem' },
        (isCollective ? '🐷 Tirelire Magique' : '👛 Portefeuille') + ' · ' + r.cost + ' points'),
      el('div', { style: 'font-size:.82rem;font-weight:800;color:var(--cyan-d);margin-top:2px' },
        'Attribuée ' + historyList.length + ' fois au total')));

  const listContainer = el('div', { style: 'display:grid;gap:8px;max-height:60vh;overflow-y:auto' });

  if (historyList.length === 0) {
    listContainer.append(el('p', { class: 'muted', style: 'text-align:center;padding:20px 0' }, 'Cette récompense n’a pas encore été attribuée.'));
  } else {
    historyList.forEach(e => {
      const childName = e.children?.first_name || 'Enfant';
      const childColor = e.children?.color || 'var(--cyan)';
      const childAvatar = e.children?.avatar || null;
      listContainer.append(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff' },
        el('div', { style: 'display:flex;align-items:center;gap:10px' },
          avatar(childName, { size: 'xs', customSrc: childAvatar, title: childName }),
          el('div', {},
            el('strong', {}, childName),
            el('div', { class: 'muted', style: 'font-size:.78rem' }, api.formatDate(e.event_date)))),
        el('span', { style: 'font-weight:800;color:var(--cyan-d);font-size:.9rem' }, pts(e.points))));
    });
  }

  modal('Historique : ' + r.label, el('div', {}, headerCard, listContainer), []);
}

// ---------------------------------------------------------------------
// 5. ONGLET 5 : SYSTÈME & EFFETS
// ---------------------------------------------------------------------
function renderSystemSection(app) {
  // Cinématiques
  const fx1 = el('input', { type: 'number', min: '1', max: '20', value: String(cinematic?.level_1_min ?? 1) });
  const fx2 = el('input', { type: 'number', min: '2', max: '50', value: String(cinematic?.level_2_min ?? 3) });
  const fx3 = el('input', { type: 'number', min: '3', max: '100', value: String(cinematic?.level_3_min ?? 8) });

  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Cinématiques de récompense'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Choisis à partir de combien de points chaque niveau d’effet visuel se déclenche.'),
    el('div', { class: 'fields' },
      champ('Retour discret dès (pts)', fx1),
      champ('Pluie de particules dès (pts)', fx2),
      champ('Feu d’artifice dès (pts)', fx3)),
    el('button', {
      class: 'btn btn-primary btn-sm', style: 'margin-top:10px',
      onclick: async () => {
        try {
          const a = Number(fx1.value), b = Number(fx2.value), c = Number(fx3.value);
          if (a < 1 || b <= a || c <= b) throw new Error('Les seuils doivent être croissants (niveau 1 < niveau 2 < niveau 3).');
          await api.save('cinematic_settings', { family_id: famille, level_1_min: a, level_2_min: b, level_3_min: c });
          cinematic = { family_id: famille, level_1_min: a, level_2_min: b, level_3_min: c };
          const mod = await import('./cinematics.js');
          mod.setCinematicThresholds(cinematic);
          toast('Seuils des cinématiques enregistrés !');
        } catch (e) { fail(e); }
      }
    }, 'Enregistrer les seuils')));

  // Dimensions des photos (réglage en direct avec la photo du premier enfant)
  const demoKid = children[0] || allChildren[0] || { first_name: 'Keyran' };

  const currentSaisiePx = parseInt(localStorage.getItem('ab_avatar_size_saisie') || '78', 10);
  const currentRecompensePx = parseInt(localStorage.getItem('ab_avatar_size_recompense') || '90', 10);

  const sliderSaisie = el('input', { type: 'range', min: '50', max: '110', step: '2', value: String(currentSaisiePx), style: 'width:100%;cursor:pointer' });
  const labelSaisiePx = el('strong', { style: 'color:var(--cyan-d);font-size:1.05rem' }, currentSaisiePx + ' px');
  const demoSaisieImg = avatar(demoKid.first_name, { size: 'xl', customSrc: demoKid.avatar, title: 'Aperçu Saisie' });
  demoSaisieImg.style.width = currentSaisiePx + 'px';
  demoSaisieImg.style.height = currentSaisiePx + 'px';

  sliderSaisie.addEventListener('input', () => {
    const px = sliderSaisie.value;
    labelSaisiePx.textContent = px + ' px';
    demoSaisieImg.style.width = px + 'px';
    demoSaisieImg.style.height = px + 'px';
    document.documentElement.style.setProperty('--avatar-size-saisie', px + 'px');
    localStorage.setItem('ab_avatar_size_saisie', px);
  });

  const sliderRecompense = el('input', { type: 'range', min: '60', max: '140', step: '2', value: String(currentRecompensePx), style: 'width:100%;cursor:pointer' });
  const labelRecompensePx = el('strong', { style: 'color:var(--cyan-d);font-size:1.05rem' }, currentRecompensePx + ' px');
  const demoRecompenseImg = avatar(demoKid.first_name, { size: 'xl', customSrc: demoKid.avatar, title: 'Aperçu Récompenses' });
  demoRecompenseImg.style.width = currentRecompensePx + 'px';
  demoRecompenseImg.style.height = currentRecompensePx + 'px';

  sliderRecompense.addEventListener('input', () => {
    const px = sliderRecompense.value;
    labelRecompensePx.textContent = px + ' px';
    demoRecompenseImg.style.width = px + 'px';
    demoRecompenseImg.style.height = px + 'px';
    document.documentElement.style.setProperty('--avatar-size-recompense', px + 'px');
    localStorage.setItem('ab_avatar_size_recompense', px);
  });

  app.append(el('div', { class: 'card' },
    el('h2', {}, '📐 Dimensions des photos (réglage en direct)'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Ajuste la taille des photos circulaires des enfants (' + demoKid.first_name + '). Le changement s’applique en temps réel.'),
    el('div', { style: 'display:grid;gap:16px;margin-top:12px' },
      el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:12px' },
        el('div', { style: 'display:flex;justify-content:space-between;margin-bottom:6px' },
          el('span', {}, 'Photo écran Saisie :'), labelSaisiePx),
        sliderSaisie,
        el('div', { style: 'display:flex;justify-content:center;margin-top:10px' }, demoSaisieImg)),
      el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:12px' },
        el('div', { style: 'display:flex;justify-content:space-between;margin-bottom:6px' },
          el('span', {}, 'Photo écran Récompenses :'), labelRecompensePx),
        sliderRecompense,
        el('div', { style: 'display:flex;justify-content:center;margin-top:10px' }, demoRecompenseImg)))));
}

// ---------------------------------------------------------------------
// RENDU PRINCIPAL
// ---------------------------------------------------------------------
function render() {
  const app = root;
  app.innerHTML = '';
  app.append(el('h1', {}, 'Réglages'));

  const themes = [
    { id: 'crew',       label: '👨‍👩‍👧‍👦 Équipage & Famille' },
    { id: 'savings',    label: '👛 Portefeuille & Tirelire' },
    { id: 'categories', label: '📋 Barème & Booster' },
    { id: 'rewards',    label: '🎁 Récompenses' },
    { id: 'system',     label: '⚙️ Système' }
  ];

  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px;overflow-x:auto;padding-bottom:2px' },
    ...themes.map(t => el('button', {
      class: 'chip' + (currentTheme === t.id ? ' on' : ''),
      style: 'font-weight:700',
      onclick: () => { currentTheme = t.id; render(); }
    }, t.label))));

  if (currentTheme === 'crew') {
    renderCrewSection(app);
  } else if (currentTheme === 'savings') {
    renderSavingsSection(app);
  } else if (currentTheme === 'categories') {
    renderBaremeSection(app);
  } else if (currentTheme === 'rewards') {
    renderRewardsSection(app);
  } else if (currentTheme === 'system') {
    renderSystemSection(app);
  }
}

export async function mount(container, sessionParent) {
  root = container;
  me = sessionParent;
  famille = sessionParent?.family_id || null;
  root.innerHTML = '<p class="muted">Chargement des réglages…</p>';
  try {
    await reload();
  } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try { await reload(); } catch (e) { fail(e); }
}
