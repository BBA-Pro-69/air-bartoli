import * as api from './api.js';
import { el, pts, toast, fail, modal, undoBar, openPhotoCropper, avatar } from './ui.js';

let root = null;
let children = [], allChildren = [], cats = [], rewards = [], special = [], boosters = [], cinematic = null, contexts = [], parents = [], crewRoles = [], savingsSettings = null, balances = [], rewardRedemptions = [];
let famille = null;
let me = null;
let currentTheme = 'crew';
let rewardFilter = 'all';

function canDo(path) {
  if (me?.is_admin) return true;
  const p = me?.crew_roles?.permissions;
  if (!p) return false;
  const parts = path.split('.');
  let cur = p;
  for (const part of parts) {
    if (cur === undefined || cur === null) return false;
    cur = cur[part];
  }
  return cur === true;
}

async function reload() {
  const [allC, ct, rw, sp, bst, cin, ctx, pr, cr, sav, bal, rRed] = await Promise.all([
    api.getAllChildren().catch(() => api.getChildren()),
    api.getCategories(),
    api.getRewards(),
    api.getSpecialDays(),
    api.getBoosterSettings(),
    api.getCinematicSettings(),
    api.getContexts().catch(() => []),
    api.getParents().catch(() => []),
    api.getCrewRoles().catch(() => []),
    api.getSavingsSettings().catch(() => ({ annual_interest_rate: 100.00, default_savings_pct: 70, active: true })),
    api.getBalances().catch(() => []),
    api.getRedemptionsHistory().catch(() => [])
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
  crewRoles = cr;
  savingsSettings = sav;
  balances = bal;
  rewardRedemptions = rRed || [];
  render();
}

function champ(label, input) {
  return el('div', { class: 'field' }, el('label', {}, label), input);
}

const subs = id => cats.filter(c => c.parent_id === id);
const roots = () => cats.filter(c => !c.parent_id);

function renderCrewSection(app) {
  const activeKids = allChildren.filter(c => c.active !== false);
  const archivedKids = allChildren.filter(c => c.active === false);

  // 1. Enfants
  if (canDo('settings.crew.children')) {
    const kidsCard = el('div', { class: 'card' },
      el('div', { class: 'row', style: 'margin-bottom:12px' },
        el('h2', { style: 'margin:0' }, 'Les Enfants (' + activeKids.length + ')'),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-sm btn-primary', onclick: () => openAddChildModal() }, '+ Ajouter un enfant')),
      el('table', { class: 'responsive' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Enfant'), el('th', {}, 'Naissance'), el('th', {}, 'Objectif hebdo'), el('th', {}, 'Part Tirelire'), el('th', {}, 'Couleur'), el('th', {}, 'Actions'))),
        el('tbody', {}, ...activeKids.map(c => {
          const nameInp = el('input', { type: 'text', value: c.first_name || '', style: 'font-weight:700;width:115px' });
          const b = el('input', { type: 'date', value: c.birth_date || '' });
          const g = el('input', { type: 'number', min: '5', max: '100', value: String(c.weekly_goal || 42) });
          const sav = el('input', { type: 'number', min: '0', max: '100', value: String(c.savings_pct ?? 70), style: 'width:65px' });
          const col = el('input', { type: 'color', value: c.color, style: 'padding:2px;height:40px;width:50px' });
          return el('tr', {},
            el('td', { 'data-th': 'Enfant' },
              el('div', { style: 'display:flex;align-items:center;gap:8px' },
                el('button', {
                  type: 'button', class: 'btn btn-sm', style: 'padding:2px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--line)',
                  onclick: () => {
                    openPhotoCropper({
                      title: 'Photo de ' + (nameInp.value || c.first_name), isCircle: true, existingSrc: c.avatar || null,
                      onSave: async blob => {
                        const url = await api.uploadMedia(blob, 'child_' + c.id);
                        await api.update('children', c.id, { avatar: url });
                        await reload(); toast('Photo mise à jour !');
                      }
                    });
                  }
                }, avatar(c.first_name, { size: 'xs', customSrc: c.avatar })),
                nameInp)),
            el('td', { 'data-th': 'Naissance' }, b),
            el('td', { 'data-th': 'Objectif' }, g),
            el('td', { 'data-th': 'Part Tirelire' }, el('div', { style: 'display:flex;align-items:center;gap:4px' }, sav, el('span', { class: 'muted' }, '%'))),
            el('td', { 'data-th': 'Couleur' }, col),
            el('td', { 'data-th': 'Actions' },
              el('div', { class: 'row', style: 'gap:6px' },
                el('button', {
                  class: 'btn btn-sm btn-primary', onclick: async () => {
                    try {
                      const newName = nameInp.value.trim();
                      if (!newName) throw new Error('Prénom obligatoire.');
                      await api.save('children', { id: c.id, family_id: famille, first_name: newName, birth_date: b.value || null, weekly_goal: Number(g.value), savings_pct: Number(sav.value), color: col.value, active: true, sort_order: c.sort_order });
                      await reload(); toast(newName + ' mis à jour.');
                    } catch (e) { fail(e); }
                  }
                }, 'Enregistrer'),
                el('button', {
                  class: 'btn btn-sm btn-ghost', style: 'color:var(--red)',
                  onclick: async () => {
                    if (!window.confirm('Archiver ' + c.first_name + ' ?')) return;
                    await api.archiveChild(c.id);
                    await reload(); toast(c.first_name + ' archivé.');
                  }
                }, 'Archiver'))));
        }))));
    app.append(kidsCard);
  }

  // 2. Banque de profils & Droits
  if (canDo('settings.crew.roles')) {
    const rolesCard = el('div', { class: 'card' },
      el('div', { class: 'row', style: 'margin-bottom:12px' },
        el('h2', { style: 'margin:0' }, '🛡️ Banque de profils & Droits d’accès (' + crewRoles.length + ')'),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-sm btn-primary', onclick: () => openEditRoleModal(null) }, '+ Créer un profil')),
      el('p', { class: 'muted', style: 'margin-top:-6px' }, 'Définissez des profils types avec leurs permissions arborescentes On / Partiel / Off.'),
      el('div', { style: 'display:grid;gap:10px;margin-top:12px' },
        ...crewRoles.map(r => {
          const isAdm = r.is_admin === true;
          return el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;display:flex;align-items:center;justify-content:space-between' },
            el('div', {},
              el('div', { style: 'display:flex;align-items:center;gap:8px' },
                el('strong', { style: 'font-size:1.05rem' }, r.name),
                el('span', { class: 'badge', style: isAdm ? 'background:#e0f2fe;color:var(--cyan-d)' : 'background:#f1f5f9;color:var(--muted)' }, isAdm ? '★ Administrateur' : 'Invité')),
              el('p', { class: 'muted', style: 'font-size:.8rem;margin:4px 0 0' },
                isAdm ? 'Accès complet et illimité à toute l’application.' : 'Droits d’accès personnalisés.')),
            el('div', { class: 'row', style: 'gap:6px' },
              el('button', { class: 'btn btn-sm', onclick: () => openEditRoleModal(r) }, 'Modifier les droits'),
              !isAdm ? el('button', {
                class: 'btn btn-sm btn-ghost', style: 'color:var(--red)',
                onclick: async () => {
                  if (!window.confirm('Supprimer le profil « ' + r.name + ' » ?')) return;
                  await api.deleteCrewRole(r.id);
                  await reload(); toast('Profil supprimé.');
                }
              }, 'Supprimer') : null));
        })));
    app.append(rolesCard);
  }

  // 3. Membres de l'équipage
  if (canDo('settings.crew.members')) {
    const membersCard = el('div', { class: 'card' },
      el('div', { class: 'row', style: 'margin-bottom:12px' },
        el('h2', { style: 'margin:0' }, 'Les Membres de l’équipage (' + parents.length + ')'),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-sm btn-primary', onclick: () => openAddCrewModal() }, '+ Inviter un membre')),
      el('div', { style: 'display:grid;gap:10px' },
        ...parents.map(p => {
          const isMe = p.user_id === me?.user_id;
          const roleObj = crewRoles.find(r => r.id === p.role_id);
          const roleName = roleObj?.name || p.role_title || (p.is_admin ? 'Parent Administrateur' : 'Membre');
          const isActive = p.active !== false;

          return el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid ' + (isActive ? 'var(--line)' : '#fecaca') + ';border-radius:12px;background:' + (isActive ? '#fff' : '#fff5f5') },
            el('div', { style: 'display:flex;align-items:center;gap:12px' },
              avatar(p.display_name, { size: 'sm', customSrc: p.avatar_url }),
              el('div', {},
                el('div', { style: 'display:flex;align-items:center;gap:8px' },
                  el('strong', {}, p.display_name),
                  isMe ? el('span', { class: 'muted', style: 'font-size:.76rem;font-weight:700' }, '(Vous)') : null,
                  el('span', { class: 'badge', style: 'background:#e0f2fe;color:var(--cyan-d);font-size:.72rem' }, roleName),
                  !isActive ? el('span', { class: 'badge', style: 'background:#fee2e2;color:#991b1b;font-size:.72rem' }, 'Masqué à la connexion') : null),
                el('span', { class: 'muted', style: 'font-size:.8rem' }, p.email || 'Email non renseigné'))),
            el('div', { class: 'row', style: 'gap:6px' },
              !isMe ? el('button', {
                class: 'btn btn-sm ' + (isActive ? 'btn-ghost' : 'btn-primary'),
                onclick: async () => {
                  const newAct = !isActive;
                  await api.updateCrewMember(p.user_id, p.display_name, p.role_title, null, p.email, newAct);
                  await reload(); toast(p.display_name + (newAct ? ' réactivé !' : ' masqué de la connexion.'));
                }
              }, isActive ? 'Désactiver' : 'Réactiver') : null,
              el('button', { class: 'btn btn-sm', onclick: () => openEditCrewModal(p) }, 'Modifier'),
              !isMe ? el('button', {
                class: 'btn btn-sm btn-ghost', style: 'color:var(--red)',
                onclick: async () => {
                  if (!window.confirm('Supprimer définitivement ' + p.display_name + ' ?')) return;
                  await api.removeCrewMember(p.user_id);
                  await reload(); toast(p.display_name + ' supprimé.');
                }
              }, 'Supprimer') : null));
        })));
    app.append(membersCard);
  }
}

function openEditRoleModal(role) {
  const isNew = !role;
  const nameInput = el('input', { type: 'text', value: role?.name || '', placeholder: 'Ex: Nounou, Grand-parent', required: true });
  const adminCheck = el('input', { type: 'checkbox', style: 'width:auto', checked: role?.is_admin || false });

  // Permissions arborescentes
  const defaultP = {
    views: { saisie: true, enfant: true, historique: true, dashboard: true },
    settings: {
      enabled: false,
      crew: { enabled: false, children: false, roles: false, members: false },
      savings: { enabled: false, interest_rate: false, distribution: false },
      bareme: { enabled: false, boosters: false, categories: false },
      rewards: { enabled: false, catalog: false, stock: false },
      system: { enabled: false, cinematics: false, photo_sizes: false }
    }
  };
  const perm = JSON.parse(JSON.stringify(role?.permissions && Object.keys(role.permissions).length ? role.permissions : defaultP));

  const treeContainer = el('div', { style: 'margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:14px;background:#f8fafc' });

  const renderTree = () => {
    treeContainer.innerHTML = '';
    if (adminCheck.checked) {
      treeContainer.append(el('p', { class: 'muted', style: 'text-align:center;padding:10px 0' }, '★ Les administrateurs ont tous les droits d’office sans restriction.'));
      return;
    }

    // Helper checkbox avec indentation
    const createBranch = (title, getVal, setVal, childrenNodes = []) => {
      const isParent = childrenNodes.length > 0;
      const chk = el('input', { type: 'checkbox', style: 'width:auto' });
      const badge = el('span', { class: 'badge', style: 'font-size:.68rem;display:none;background:#f3e8ff;color:#7e22ce' }, 'Partiel');

      const updateUI = () => {
        if (isParent) {
          const childVals = childrenNodes.map(c => c.get());
          const allTrue = childVals.every(v => v === true);
          const allFalse = childVals.every(v => v === false);
          if (allTrue) { chk.checked = true; chk.indeterminate = false; badge.style.display = 'none'; setVal(true); }
          else if (allFalse) { chk.checked = false; chk.indeterminate = false; badge.style.display = 'none'; setVal(false); }
          else { chk.checked = false; chk.indeterminate = true; badge.style.display = 'inline-block'; setVal(true); }
        } else {
          chk.checked = getVal();
        }
      };

      chk.onchange = () => {
        const target = chk.checked;
        if (isParent) {
          childrenNodes.forEach(c => c.set(target));
          setVal(target);
          renderTree();
        } else {
          setVal(target);
          renderTree();
        }
      };

      updateUI();
      return { row: el('div', { style: 'display:flex;align-items:center;gap:8px;padding:3px 0' }, chk, el('span', { style: 'font-weight:600;font-size:.88rem' }, title), badge), get: getVal, set: setVal };
    };

    // Ecrans principaux
    treeContainer.append(el('h4', { style: 'margin:0 0 6px;color:var(--navy)' }, 'Écrans principaux :'));
    treeContainer.append(
      createBranch('＋ Saisie', () => perm.views.saisie, v => perm.views.saisie = v).row,
      createBranch('★ Récompenses', () => perm.views.enfant, v => perm.views.enfant = v).row,
      createBranch('≡ Journal', () => perm.views.historique, v => perm.views.historique = v).row,
      createBranch('◔ Analyse', () => perm.views.dashboard, v => perm.views.dashboard = v).row
    );

    // Espace Réglages & sous-sections
    treeContainer.append(el('h4', { style: 'margin:14px 0 6px;color:#a21caf' }, 'Espace Réglages & Sous-parties :'));

    // 1. Crew
    const crewKids = [
      createBranch('Gestion des Enfants', () => perm.settings.crew.children, v => perm.settings.crew.children = v),
      createBranch('Banque de profils & Droits', () => perm.settings.crew.roles, v => perm.settings.crew.roles = v),
      createBranch('Membres de l’équipage', () => perm.settings.crew.members, v => perm.settings.crew.members = v)
    ];
    const crewBranch = createBranch('👨‍👩‍👧‍👦 Équipage & Famille', () => perm.settings.crew.enabled, v => perm.settings.crew.enabled = v, crewKids);

    // 2. Savings
    const savKids = [
      createBranch('Taux d’intérêt annuel', () => perm.settings.savings.interest_rate, v => perm.settings.savings.interest_rate = v),
      createBranch('Clé de répartition (Portefeuille / Tirelire)', () => perm.settings.savings.distribution, v => perm.settings.savings.distribution = v)
    ];
    const savBranch = createBranch('👛 Portefeuille & Tirelire', () => perm.settings.savings.enabled, v => perm.settings.savings.enabled = v, savKids);

    // 3. Bareme
    const barKids = [
      createBranch('Boosters de régularité', () => perm.settings.bareme.boosters, v => perm.settings.bareme.boosters = v),
      createBranch('Catégories et barèmes', () => perm.settings.bareme.categories, v => perm.settings.bareme.categories = v)
    ];
    const barBranch = createBranch('📋 Barème & Booster', () => perm.settings.bareme.enabled, v => perm.settings.bareme.enabled = v, barKids);

    // 4. Rewards
    const rewKids = [
      createBranch('Catalogue des récompenses', () => perm.settings.rewards.catalog, v => perm.settings.rewards.catalog = v),
      createBranch('Gestion des stocks', () => perm.settings.rewards.stock, v => perm.settings.rewards.stock = v)
    ];
    const rewBranch = createBranch('🎁 Récompenses', () => perm.settings.rewards.enabled, v => perm.settings.rewards.enabled = v, rewKids);

    // 5. System
    const sysKids = [
      createBranch('Cinématiques', () => perm.settings.system.cinematics, v => perm.settings.system.cinematics = v),
      createBranch('Dimensions des photos', () => perm.settings.system.photo_sizes, v => perm.settings.system.photo_sizes = v)
    ];
    const sysBranch = createBranch('⚙️ Système', () => perm.settings.system.enabled, v => perm.settings.system.enabled = v, sysKids);

    const settingsBranch = createBranch('⚙️ Accès général Réglages', () => perm.settings.enabled, v => perm.settings.enabled = v, [crewBranch, savBranch, barBranch, rewBranch, sysBranch]);

    treeContainer.append(settingsBranch.row);

    const indCard = (branch, kids) => el('div', { style: 'margin-left:20px;padding-left:10px;border-left:2px solid var(--line);margin-bottom:8px' },
      branch.row,
      el('div', { style: 'margin-left:20px;padding-left:8px;border-left:2px solid #e2e8f0' }, ...kids.map(k => k.row)));

    treeContainer.append(
      indCard(crewBranch, crewKids),
      indCard(savBranch, savKids),
      indCard(barBranch, barKids),
      indCard(rewBranch, rewKids),
      indCard(sysBranch, sysKids)
    );
  };

  adminCheck.onchange = renderTree;
  renderTree();

  const body = el('div', {},
    champ('Nom du profil', nameInput),
    el('label', { class: 'row', style: 'gap:8px;cursor:pointer;margin:10px 0' }, adminCheck, el('strong', {}, 'Profil Super-Administrateur')),
    treeContainer);

  modal(isNew ? 'Créer un profil type' : 'Modifier les droits de ' + role.name, body, [{
    label: 'Enregistrer le profil', class: 'btn-primary',
    onClick: async close => {
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error('Le nom du profil est obligatoire.');
        await api.saveCrewRole({
          ...(role?.id ? { id: role.id } : {}),
          family_id: famille, name, is_admin: adminCheck.checked, permissions: perm
        });
        close(); await reload(); toast('Profil enregistré !');
      } catch (e) { fail(e); }
    }
  }]);
}

function openEditCrewModal(p) {
  const isMe = p.user_id === me?.user_id;
  const nameInput = el('input', { type: 'text', value: p.display_name || '', required: true });
  const emailInput = el('input', { type: 'email', value: p.email || '' });
  const roleSelect = el('select', {},
    ...crewRoles.map(r => el('option', { value: r.id, selected: p.role_id === r.id }, r.name + (r.is_admin ? ' (Admin)' : ''))));
  const activeCheck = el('input', { type: 'checkbox', style: 'width:auto', checked: p.active !== false, disabled: isMe });

  const body = el('div', {},
    champ('Prénom / Nom d’usage', nameInput),
    champ('Rôle / Profil affecté', roleSelect),
    champ('Adresse email', emailInput),
    el('label', { class: 'row', style: 'gap:8px;cursor:' + (isMe ? 'not-allowed' : 'pointer') + ';margin-top:10px' }, activeCheck, el('span', {}, 'Actif (visible sur l’écran de connexion)')),
    isMe ? el('p', { class: 'muted', style: 'font-size:.78rem' }, 'Vous ne pouvez pas désactiver votre propre compte.') : null);

  modal('Modifier le profil de ' + p.display_name, body, [{
    label: 'Enregistrer', class: 'btn-primary',
    onClick: async close => {
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error('Prénom obligatoire.');
        const rObj = crewRoles.find(r => r.id === roleSelect.value);
        await api.updateCrewMember(p.user_id, name, rObj?.name || p.role_title, null, emailInput.value.trim(), isMe ? null : activeCheck.checked, roleSelect.value);
        close(); await reload(); toast('Membre mis à jour !');
      } catch (e) { fail(e); }
    }
  }]);
}

function openAddCrewModal() {
  const nameInput = el('input', { type: 'text', placeholder: 'Ex: Nounou Sophie, Papy Jean', required: true });
  const roleSelect = el('select', {},
    ...crewRoles.map(r => el('option', { value: r.id }, r.name + (r.is_admin ? ' (Admin)' : ''))));
  const emailInput = el('input', { type: 'email', placeholder: 'adresse@gmail.com', required: true });
  const pwdInput = el('input', { type: 'password', placeholder: 'Mot de passe (min 6 car.)', required: true });

  const body = el('div', {},
    champ('Prénom / Nom d’usage', nameInput),
    champ('Profil affecté', roleSelect),
    champ('Adresse email (connexion)', emailInput),
    champ('Mot de passe initial', pwdInput));

  modal('Inviter un membre d’équipage', body, [{
    label: 'Créer l’accès', class: 'btn-primary',
    onClick: async close => {
      try {
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const pwd = pwdInput.value;
        if (!name || !email || !pwd) throw new Error('Tous les champs sont requis.');
        const rObj = crewRoles.find(r => r.id === roleSelect.value);
        await api.createCrewMember(email, pwd, name, rObj?.name || 'Membre d’équipage', roleSelect.value);
        close(); await reload(); toast('Accès créé pour ' + name + ' !');
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

  const body = el('div', {},
    champ('Prénom', nameInput),
    champ('Date de naissance', birthInput),
    el('div', { class: 'fields' }, champ('Objectif hebdo', goalInput), champ('Part Tirelire (%)', savInput), champ('Couleur', colorInput)));

  modal('Ajouter un enfant', body, [{
    label: 'Créer le profil', class: 'btn-primary',
    onClick: async close => {
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error('Prénom obligatoire.');
        await api.insert('children', { family_id: famille, first_name: name, birth_date: birthInput.value || null, weekly_goal: Number(goalInput.value) || 42, savings_pct: Number(savInput.value) || 70, color: colorInput.value, active: true, sort_order: children.length + 1 });
        close(); await reload(); toast('Enfant ajouté !');
      } catch (e) { fail(e); }
    }
  }]);
}

function renderSavingsSection(app) {
  if (canDo('settings.savings.interest_rate')) {
    const rateInput = el('input', { type: 'number', step: '5', min: '0', max: '200', value: String(savingsSettings?.annual_interest_rate ?? 100.00) });
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Taux d’intérêt annuel de la Tirelire Magique'),
      champ('Taux d’intérêt annuel (% / an)', rateInput),
      el('button', {
        class: 'btn btn-primary btn-sm', style: 'margin-top:10px',
        onclick: async () => {
          await api.save('savings_settings', { family_id: famille, annual_interest_rate: Number(rateInput.value), active: true, updated_at: new Date().toISOString() });
          toast('Taux enregistré !'); await reload();
        }
      }, 'Enregistrer le taux')));
  }

  if (canDo('settings.savings.distribution')) {
    const savedGlobalPct = savingsSettings?.default_savings_pct ?? 70;
    const globalSlider = el('input', { type: 'range', class: 'app-slider', min: '0', max: '100', step: '5', value: String(savedGlobalPct) });
    const globalLabel = el('strong', { style: 'color:#a21caf' }, savedGlobalPct + ' % Tirelire');

    globalSlider.oninput = () => { globalLabel.textContent = globalSlider.value + ' % Tirelire / ' + (100 - Number(globalSlider.value)) + ' % Portefeuille'; };

    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Répartition des gains (Portefeuille vs Tirelire)'),
      el('div', { style: 'display:flex;justify-content:space-between' }, el('span', {}, 'Règle par défaut pour toute la fratrie :'), globalLabel),
      globalSlider,
      el('button', {
        class: 'btn btn-primary btn-sm', style: 'margin-top:10px',
        onclick: async () => {
          const s = Number(globalSlider.value);
          await api.save('savings_settings', { family_id: famille, default_savings_pct: s, annual_interest_rate: savingsSettings?.annual_interest_rate ?? 100.0 });
          await Promise.all(children.map(c => api.save('children', { id: c.id, family_id: famille, first_name: c.first_name, birth_date: c.birth_date, weekly_goal: c.weekly_goal, savings_pct: s, color: c.color, active: true, sort_order: c.sort_order })));
          toast('Répartition appliquée !'); await reload();
        }
      }, '⚡ Appliquer à tous les enfants')));
  }
}

function renderBaremeSection(app) {
  if (canDo('settings.bareme.boosters')) {
    const weekBooster = boosters.find(b => b.period_type === 'week');
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Boosters de régularité'),
      el('p', { class: 'muted' }, 'Bonus accordé lors d’une régularité validée.')));
  }

  if (canDo('settings.bareme.categories')) {
    const catBox = el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('h2', { style: 'margin:0' }, 'Catégories et barème de points'),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-sm btn-primary', onclick: () => formCategorie(null, null) }, '+ Grande catégorie')));
    roots().forEach(r => {
      catBox.append(el('div', { style: 'margin-top:12px;padding-top:10px;border-top:1px solid var(--line)' },
        el('div', { class: 'row' },
          el('strong', {}, r.label),
          el('div', { class: 'spacer' }),
          el('button', { class: 'btn btn-sm', onclick: () => formCategorie(r) }, 'Modifier')),
        el('div', { class: 'tiles', style: 'margin-top:8px' },
          ...subs(r.id).map(s => el('button', {
            class: 'tile ' + (s.kind === 'malus' ? 'tile-malus' : 'tile-bonus'),
            onclick: () => formCategorie(s)
          }, el('span', {}, s.label), el('span', { class: 'tile-pts' }, (s.kind === 'malus' ? '-' : '+') + s.default_points))))));
    });
    app.append(catBox);
  }
}

function formCategorie(cat, parentId) {
  const isSub = !!(cat ? cat.parent_id : parentId);
  const label = el('input', { type: 'text', value: cat?.label || '', required: true });
  const points = el('input', { type: 'number', min: '0', max: '50', value: String(cat?.default_points ?? 2) });

  const body = el('div', {}, champ('Libellé', label), champ('Points par défaut', points));
  modal(cat ? 'Modifier' : 'Nouvelle catégorie', body, [{
    label: 'Enregistrer', class: 'btn-primary',
    onClick: async close => {
      await api.save('categories', { family_id: famille, parent_id: cat ? cat.parent_id : (parentId || null), label: label.value.trim(), default_points: Number(points.value), active: true, kind: cat?.kind || (isSub ? 'bonus' : 'both') });
      close(); await reload(); toast('Catégorie enregistrée.');
    }
  }]);
}

function renderRewardsSection(app) {
  const indRewards = rewards.filter(r => r.scope === 'individual');
  const colRewards = rewards.filter(r => r.scope === 'collective');

  const filteredRewards = rewards.filter(r => {
    if (rewardFilter === 'individual') return r.scope === 'individual';
    if (rewardFilter === 'collective') return r.scope === 'collective';
    return true;
  });

  app.append(el('div', { class: 'card' },
    el('div', { class: 'row' },
      el('h2', { style: 'margin:0' }, 'Catalogue des récompenses'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm btn-primary', onclick: () => formRecompense(null) }, '+ Nouvelle récompense')),
    el('div', { class: 'chips', style: 'margin:12px 0' },
      el('button', { class: 'chip' + (rewardFilter === 'all' ? ' on' : ''), onclick: () => { rewardFilter = 'all'; render(); } }, 'Toutes (' + rewards.length + ')'),
      el('button', { class: 'chip' + (rewardFilter === 'individual' ? ' on' : ''), onclick: () => { rewardFilter = 'individual'; render(); } }, 'Individuelles 👛 (' + indRewards.length + ')'),
      el('button', { class: 'chip' + (rewardFilter === 'collective' ? ' on' : ''), onclick: () => { rewardFilter = 'collective'; render(); } }, 'Collectives 🐷 (' + colRewards.length + ')')),
    el('div', { class: 'rewards', style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))' },
      ...filteredRewards.map(r => {
        const isCol = r.scope === 'collective';
        const isStockLimited = r.stock !== null && r.stock !== undefined;
        let stockBadge = null;
        if (isStockLimited) {
          stockBadge = r.stock > 0
            ? el('span', { class: 'badge', style: 'background:#f1f5f9;color:var(--muted);font-size:.72rem' }, '📦 ' + r.stock + ' en stock')
            : el('span', { class: 'badge', style: 'background:#fee2e2;color:#991b1b;font-size:.72rem' }, '📦 Épuisé');
        }

        return el('div', { class: 'reward', style: 'padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff' },
          r.image_url ? el('img', { src: r.image_url, style: 'width:100%;height:130px;object-fit:cover;border-radius:10px;margin-bottom:8px' }) : null,
          el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' },
            el('div', {},
              el('strong', { style: 'font-size:1.05rem;display:block' }, r.label),
              el('span', { class: 'badge', style: isCol ? 'background:#fdf4ff;color:#a21caf;font-size:.72rem' : 'background:#f0f9ff;color:var(--cyan-d);font-size:.72rem' }, isCol ? '🐷 Tirelire' : '👛 Portefeuille'),
              stockBadge),
            el('span', { style: 'font-size:1.3rem;font-weight:900;color:var(--navy)' }, r.cost + ' pts')),
          el('div', { class: 'row', style: 'margin-top:10px;gap:8px' },
            el('button', { class: 'btn btn-sm', style: 'flex:1', onclick: () => formRecompense(r) }, 'Modifier'),
            el('button', { class: 'btn btn-sm btn-ghost', style: 'color:var(--red)', onclick: async () => {
              if (!window.confirm('Supprimer ' + r.label + ' ?')) return;
              await api.remove('rewards', r.id); await reload(); toast('Récompense supprimée.');
            } }, 'Supprimer')));
      }))));
}

function formRecompense(r) {
  const label = el('input', { type: 'text', value: r?.label || '', required: true });
  const scope = el('select', {},
    el('option', { value: 'individual', selected: (r?.scope || 'individual') === 'individual' }, 'Individuelle (Portefeuille 👛)'),
    el('option', { value: 'collective', selected: r?.scope === 'collective' }, 'Collective (Tirelire Magique 🐷)'));
  const cost = el('input', { type: 'number', min: '1', value: String(r?.cost ?? 20) });

  // Choix gestion stock limite ou illimite
  const isLimited = r?.stock !== null && r?.stock !== undefined;
  const stockSelect = el('select', {},
    el('option', { value: 'unlimited', selected: !isLimited }, 'Illimitée (privilèges, sorties, etc.)'),
    el('option', { value: 'limited', selected: isLimited }, 'Quantité limitée (puzzles, livres, etc.)'));
  const stockInp = el('input', { type: 'number', min: '0', value: String(r?.stock ?? 1), style: 'width:100px;' + (isLimited ? '' : 'display:none') });

  stockSelect.onchange = () => { stockInp.style.display = stockSelect.value === 'limited' ? '' : 'none'; };

  const body = el('div', {},
    champ('Libellé', label),
    el('div', { class: 'fields' }, champ('Type', scope), champ('Prix en points', cost)),
    champ('Disponibilité', stockSelect),
    el('div', { style: 'margin-bottom:10px' }, stockInp));

  modal(r ? 'Modifier la récompense' : 'Nouvelle récompense', body, [{
    label: 'Enregistrer', class: 'btn-primary',
    onClick: async close => {
      const isLim = stockSelect.value === 'limited';
      await api.save('rewards', {
        ...(r?.id ? { id: r.id } : {}),
        family_id: famille, label: label.value.trim(), scope: scope.value,
        cost: Number(cost.value), active: true,
        stock: isLim ? Number(stockInp.value) : null
      });
      close(); await reload(); toast('Récompense enregistrée.');
    }
  }]);
}

function renderSystemSection(app) {
  if (canDo('settings.system.photo_sizes')) {
    const demoKid = children[0] || allChildren[0] || { first_name: 'Keyran' };
    const curPx = parseInt(localStorage.getItem('ab_avatar_size_saisie') || '78', 10);
    const slider = el('input', { type: 'range', class: 'app-slider', min: '50', max: '110', value: String(curPx) });
    const img = avatar(demoKid.first_name, { size: 'xl', customSrc: demoKid.avatar });
    img.style.width = curPx + 'px'; img.style.height = curPx + 'px';

    slider.oninput = () => {
      img.style.width = slider.value + 'px'; img.style.height = slider.value + 'px';
      document.documentElement.style.setProperty('--avatar-size-saisie', slider.value + 'px');
      localStorage.setItem('ab_avatar_size_saisie', slider.value);
    };

    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Dimensions des photos (Saisie)'),
      slider,
      el('div', { style: 'display:flex;justify-content:center;margin-top:10px' }, img)));
  }
}

function render() {
  const app = root;
  app.innerHTML = '';
  app.append(el('h1', {}, 'Réglages'));

  const allThemes = [
    { id: 'crew',       label: '👨‍👩‍👧‍👦 Équipage & Famille', perm: canDo('settings.crew.enabled') },
    { id: 'savings',    label: '👛 Portefeuille & Tirelire', perm: canDo('settings.savings.enabled') },
    { id: 'categories', label: '📋 Barème & Booster', perm: canDo('settings.bareme.enabled') },
    { id: 'rewards',    label: '🎁 Récompenses', perm: canDo('settings.rewards.enabled') },
    { id: 'system',     label: '⚙️ Système', perm: canDo('settings.system.enabled') }
  ];
  const themes = allThemes.filter(t => t.perm);

  if (!themes.some(t => t.id === currentTheme)) {
    currentTheme = themes[0]?.id || 'crew';
  }

  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px;overflow-x:auto' },
    ...themes.map(t => el('button', {
      class: 'chip' + (currentTheme === t.id ? ' on' : ''),
      onclick: () => { currentTheme = t.id; render(); }
    }, t.label))));

  if (currentTheme === 'crew') renderCrewSection(app);
  else if (currentTheme === 'savings') renderSavingsSection(app);
  else if (currentTheme === 'categories') renderBaremeSection(app);
  else if (currentTheme === 'rewards') renderRewardsSection(app);
  else if (currentTheme === 'system') renderSystemSection(app);
}

export async function mount(container, sessionParent) {
  root = container;
  me = sessionParent;
  famille = sessionParent?.family_id || null;

  const canAccessSettings = me?.is_admin || me?.crew_roles?.permissions?.settings?.enabled === true;
  if (!canAccessSettings) {
    container.innerHTML = '<div class="card" style="text-align:center;padding:40px 16px;max-width:480px;margin:30px auto"><div style="font-size:2.5rem;margin-bottom:10px">🔒</div><h2>Accès réservé aux administrateurs</h2><p class="muted">Votre profil (' + (me?.role_title || 'Membre d’équipage') + ') n’est pas autorisé à accéder aux réglages.</p><button class="btn btn-primary" onclick="location.replace(\'index.html\')" style="margin-top:14px">Retour à l’accueil</button></div>';
    return;
  }

  root.innerHTML = '<p class="muted">Chargement des réglages…</p>';
  try { await reload(); } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try { await reload(); } catch (e) { fail(e); }
}
