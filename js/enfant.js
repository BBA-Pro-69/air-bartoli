// =====================================================================
//  Ecran Récompenses (🎁) — Air Bartoli
//  1. Bandeau photo XL, solde total et répartition Portefeuille & Tirelire
//  2. Sous-onglets : « Individuelles 👛 » & « Collectives 🐷 »
//  3. Curseurs asservis + saisie numérique directe garantissant la somme exacte
//  4. Répartition multi-enfants automatique et lissée sans à-coups (N enfants)
//  5. Historique riche des récompenses acquises avec filtres et KPIs
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, modal, gauge, undoBar, avatar } from './ui.js';
import { celebrateMilestone } from './cinematics.js';

let root = null;
let children = [], levels = [], balances = [], rewards = [], elig = [], rates = [], rewardHistory = [];
let current = null;
let mainSection = 'catalog'; // 'catalog' | 'history'
let currentTab = 'individual'; // 'individual' | 'collective'

// Filtres pour l'historique des récompenses acquises
let histFilterChild = 'all'; // 'all' | child_id
let histFilterScope = 'all'; // 'all' | 'individual' | 'collective'
let histFilterTime  = 'all'; // 'all' | 'month' | 'quarter' | 'year'
let histFilterRewardId = 'all'; // 'all' | reward_id

const bal   = id => (balances.find(b => b.child_id === id) || {}).balance ?? 0;
const rate  = id => (rates.find(r => r.child_id === id) || {}).weekly_rate ?? 0;
const level = id => levels.find(l => l.child_id === id) || {};
const kid   = id => children.find(c => c.id === id) || {};

function champ(label, input) {
  return el('div', { class: 'field' }, el('label', {}, label), input);
}

// Algorithme de répartition équitable d'un total T entre N enfants (les premiers prennent l'arrondi)
function distributePoints(total, n) {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => i < rem ? base + 1 : base);
}

// Algorithme d'ajustement lissé des parts sur les autres enfants sans tout faire sauter
function adjustShares(shares, changedIdx, newVal, total) {
  const n = shares.length;
  if (n <= 1) return [total];

  newVal = Math.max(0, Math.min(total, newVal));
  const res = [...shares];
  const oldVal = res[changedIdx];
  const delta = newVal - oldVal;
  if (delta === 0) return res;

  res[changedIdx] = newVal;
  const otherIndices = Array.from({ length: n }, (_, i) => i).filter(i => i !== changedIdx);

  if (delta > 0) {
    let needed = delta;
    while (needed > 0) {
      const available = otherIndices.filter(i => res[i] > 0);
      if (available.length === 0) {
        res[changedIdx] -= needed;
        break;
      }
      available.sort((a, b) => res[b] - res[a]);
      for (const idx of available) {
        if (needed <= 0) break;
        const take = Math.min(needed, Math.max(1, Math.floor(res[idx] / available.length) || 1));
        res[idx] -= take;
        needed -= take;
      }
    }
  } else {
    let toAdd = -delta;
    while (toAdd > 0) {
      for (const idx of otherIndices) {
        if (toAdd <= 0) break;
        res[idx] += 1;
        toAdd -= 1;
      }
    }
  }

  // Ajustement de précision final pour verrouiller la somme exacte
  const diff = total - res.reduce((s, v) => s + v, 0);
  if (diff !== 0) {
    for (const idx of otherIndices) {
      if (res[idx] + diff >= 0) {
        res[idx] += diff;
        break;
      }
    }
  }
  return res;
}

async function load() {
  const [c, lv, b, rw, elg, rt, redHist] = await Promise.all([
    api.getChildren(), api.getLevels(), api.getBalances(),
    api.getRewards(), api.getEligibility(), api.getRates(),
    api.getRedemptionsHistory()
  ]);
  children = c.filter(k => k.active !== false);
  levels = lv;
  balances = b;
  rewards = rw;
  elig = elg;
  rates = rt;

  // Historique basé sur les échanges réels approuvés (redemptions)
  rewardHistory = redHist || [];

  if (!current || !children.some(k => k.id === current)) {
    current = children[0]?.id;
  }
}

function etaText(days) {
  if (days === null || days === undefined) return 'continue à gagner des points pour voir la date';
  if (days <= 0)  return 'c’est bon, tu peux le prendre';
  if (days === 1) return 'c’est pour demain';
  if (days <= 14) return 'dans ' + days + ' jours';
  const w = Math.round(days / 7);
  return 'dans environ ' + w + ' semaines';
}

function divider(title) {
  return el('div', { class: 'section-divider' }, el('span', {}, title));
}

function render() {
  const c = kid(current), lv = level(current), b = bal(current);
  const app = root;
  app.innerHTML = '';

  // Sélecteur d'enfant (photos seules, centrées)
  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px;justify-content:center;gap:14px' },
    ...children.map(k => el('button', {
      class: 'chip' + (k.id === current ? ' on' : ''),
      style: 'border-radius:999px;padding:4px 10px;min-height:50px',
      onclick: () => { current = k.id; render(); }
    }, avatar(k.first_name, { size: 'md', customSrc: k.avatar, title: k.first_name })))));

  // Bandeau synthétique : photo XL, solde total et répartition Portefeuille / Tirelire Magique
  const balObj = balances.find(x => x.child_id === current) || {};
  const walletPts = balObj.wallet_balance ?? 0;
  const savingsPts = balObj.savings_balance ?? 0;
  const todayPending = balObj.today_pending ?? 0;

  app.append(el('div', { class: 'hero', style: `background:linear-gradient(150deg,${c.color},#0B2046);padding:22px 16px;text-align:center` },
    el('div', { class: 'recompense-custom-avatar', style: 'display:flex;justify-content:center;margin-bottom:8px' },
      avatar(c.first_name, { size: 'xl', customSrc: c.avatar, title: c.first_name })),
    el('div', { class: 'hero-balance', style: 'font-size:2.8rem;line-height:1;margin-top:4px' }, String(b)),
    el('div', { class: 'hero-sub', style: 'font-size:.9rem;font-weight:600;opacity:.9;margin-bottom:12px' }, 'points disponibles acquis'),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:380px;margin:10px auto 0' },
      el('div', { style: 'background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:14px;padding:10px 6px;text-align:center' },
        el('div', { style: 'font-size:1.3rem' }, '👛'),
        el('div', { style: 'font-size:1.4rem;font-weight:900;color:#fff' }, String(walletPts)),
        el('div', { style: 'font-size:.76rem;color:rgba(255,255,255,.95);font-weight:700' }, 'Portefeuille'),
        el('div', { style: 'font-size:.66rem;color:rgba(255,255,255,.75)' }, 'dépenses libres')),
      el('div', { style: 'background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:14px;padding:10px 6px;text-align:center' },
        el('div', { style: 'font-size:1.3rem' }, '🐷✨'),
        el('div', { style: 'font-size:1.4rem;font-weight:900;color:#fff' }, String(savingsPts)),
        el('div', { style: 'font-size:.76rem;color:rgba(255,255,255,.95);font-weight:700' }, 'Tirelire Magique'),
        el('div', { style: 'font-size:.66rem;color:rgba(255,255,255,.75)' }, 'grands projets & +intérêts'))),
    (todayPending > 0
      ? el('div', { style: 'margin-top:12px;display:inline-flex;align-items:center;gap:6px;background:rgba(0,167,225,.3);border:1px solid rgba(0,167,225,.5);padding:4px 12px;border-radius:999px;font-size:.76rem;color:#fff;font-weight:700' },
          '✈️ +' + todayPending + ' pt' + (todayPending > 1 ? 's' : '') + ' en cours de vol (versés cette nuit à minuit)')
      : null)));

  // Séparateur avec titre centré
  app.append(divider('Récompenses'));

  // Menu principal : « Récompenses à gagner » vs « Récompenses acquises »
  const mainTabs = [
    { id: 'catalog', label: '🎁 Récompenses à gagner' },
    { id: 'history', label: '📜 Récompenses acquises (' + rewardHistory.length + ')' }
  ];

  app.append(el('div', { class: 'chips', style: 'margin-bottom:16px;justify-content:center;gap:10px' },
    ...mainTabs.map(t => el('button', {
      class: 'chip' + (mainSection === t.id ? ' on' : ''),
      style: 'font-weight:700',
      onclick: () => { mainSection = t.id; render(); }
    }, t.label))));

  if (mainSection === 'catalog') {
    renderCatalogSection(app);
  } else {
    renderHistorySection(app);
  }
}

// ---------------------------------------------------------------------
// Section « Récompenses à gagner » (Catalogue)
// ---------------------------------------------------------------------
function renderCatalogSection(app) {
  const indRewards = rewards.filter(r => r.scope === 'individual' && r.active);
  const colRewards = rewards.filter(r => r.scope === 'collective' && r.active);

  const subTabs = [
    { id: 'individual', label: 'Individuelles 👛 (' + indRewards.length + ')' },
    { id: 'collective', label: 'Collectives 🐷 (' + colRewards.length + ')' }
  ];

  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px' },
    ...subTabs.map(t => el('button', {
      class: 'chip' + (currentTab === t.id ? ' on' : ''),
      onclick: () => { currentTab = t.id; render(); }
    }, t.label))));

  if (currentTab === 'individual') {
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Récompenses individuelles'),
      indRewards.length
        ? el('div', { class: 'rewards' }, ...indRewards.map(r => rewardCard(r)))
        : el('p', { class: 'muted' }, 'Aucune récompense individuelle configurée.')));
  } else if (currentTab === 'collective') {
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Récompenses collectives'),
      el('p', { class: 'muted', style: 'margin-top:-6px' },
        'Projets communs pour toute la fratrie. Vous pouvez moduler la part payée par chaque enfant et le choix Portefeuille vs Tirelire.'),
      colRewards.length
        ? el('div', { class: 'rewards' }, ...colRewards.map(r => collectiveCard(r)))
        : el('p', { class: 'muted' }, 'Aucune récompense collective configurée.')));
  }
}

function rewardCard(r) {
  const bo = balances.find(x => x.child_id === current) || {};
  const walletPts = bo.wallet_balance ?? 0;
  const savingsPts = bo.savings_balance ?? 0;
  const totalAvailable = walletPts + savingsPts;
  const e = elig.find(x => x.reward_id === r.id && x.child_id === current) || {};
  const isOutOfStock = r.stock !== null && r.stock !== undefined && r.stock <= 0;
  const isLastOne = r.stock === 1;
  const ready = totalAvailable >= r.cost && !isOutOfStock;

  const card = el('div', {
    class: 'reward' + (ready ? ' ready' : ''),
    style: 'cursor:pointer;transition:transform .12s, box-shadow .12s',
    onclick: () => openAttributionModal(r)
  },
    r.image_url ? el('img', { src: r.image_url, class: 'reward-img' }) : null,
    (isOutOfStock ? el('div', { style: 'margin-bottom:6px' }, el('span', { class: 'badge', style: 'background:#fee2e2;color:#991b1b' }, 'Rupture de stock / Épuisé')) : null),
    (!isOutOfStock && isLastOne ? el('div', { style: 'margin-bottom:6px' }, el('span', { class: 'badge', style: 'background:#fef3c7;color:#b45309' }, '📦 Dernier exemplaire !')) : null),
    el('div', { class: 'reward-top' },
      el('div', {},
        el('strong', {}, r.label),
        el('div', { style: 'font-size:.74rem;color:var(--cyan-d);font-weight:700;margin-top:2px' }, '👛 Portefeuille (ou Tirelire)')),
      el('span', { class: 'reward-cost' }, r.cost + ' pts')),
    el('div', { style: 'margin:10px 0 6px' }, gauge(totalAvailable, r.cost, kid(current).color)),
    el('div', { class: 'eta' }, ready
      ? el('strong', { style: 'color:var(--green)' }, '✓ Points suffisants ! Prêt à être attribué.')
      : el('span', {}, 'Il manque ', el('strong', {}, (r.cost - totalAvailable) + ' points'), ', ', etaText(e.days_left))),
    el('button', {
      type: 'button',
      class: 'btn btn-primary btn-block reward-action-btn',
      style: 'margin-top:12px;width:100%',
      disabled: isOutOfStock,
      onclick: ev => {
        ev.stopPropagation();
        if (isOutOfStock) {
          modal('📦 Récompense épuisée', el('p', { class: 'muted', style: 'text-align:center;padding:12px 0' }, 'Cette récompense est en rupture de stock. Les stocks seront renouvelés prochainement !'), [{ label: 'Compris', class: 'btn-primary', onClick: close => close() }]);
          return;
        }
        openAttributionModal(r);
      }
    }, isOutOfStock ? 'Épuisé' : '🎁 Attribuer cette récompense'));

  return card;
}

function collectiveCard(r) {
  const totalAvailable = children.reduce((sum, c) => {
    const bo = balances.find(x => x.child_id === c.id) || {};
    return sum + (bo.wallet_balance ?? 0) + (bo.savings_balance ?? 0);
  }, 0);
  const ready = totalAvailable >= r.cost;

  const card = el('div', {
    class: 'reward' + (ready ? ' ready' : ''),
    style: 'cursor:pointer;transition:transform .12s, box-shadow .12s',
    onclick: () => openAttributionModal(r)
  },
    r.image_url ? el('img', { src: r.image_url, class: 'reward-img' }) : null,
    el('div', { class: 'reward-top' },
      el('div', {},
        el('strong', {}, r.label),
        el('div', { style: 'font-size:.74rem;color:#a21caf;font-weight:700;margin-top:2px' }, '🐷 Tirelire Magique (ou Portefeuille)')),
      el('span', { class: 'reward-cost' }, r.cost + ' pts')),
    el('div', { style: 'margin:10px 0 6px' }, gauge(totalAvailable, r.cost, '#a21caf')),
    el('div', { class: 'eta' }, 'Cagnotte disponible : ', el('strong', {}, totalAvailable + ' / ' + r.cost + ' pts')),
    el('button', {
      type: 'button',
      class: 'btn btn-primary btn-block reward-action-btn',
      style: 'margin-top:12px;width:100%',
      onclick: ev => { ev.stopPropagation(); openAttributionModal(r); }
    }, '🎁 Attribuer cette sortie collective'));

  return card;
}

// ---------------------------------------------------------------------
// MODALE INTERACTIVE D'ATTRIBUTION AVEC CURSEURS & SAISIE ASSERVIS
// ---------------------------------------------------------------------
function openAttributionModal(r) {
  const isCollective = r.scope === 'collective';

  if (!isCollective) {
    // Cas individuel : pour l'enfant sélectionné
    const c = kid(current);
    const bo = balances.find(x => x.child_id === current) || {};
    const wBal = bo.wallet_balance ?? 0;
    const sBal = bo.savings_balance ?? 0;
    const totalAvail = wBal + sBal;

    // Pop-up si solde insuffisant
    if (totalAvail < r.cost) {
      const diff = r.cost - totalAvail;
      modal('⚠️ Points insuffisants', el('div', {},
        el('div', { style: 'text-align:center;margin-bottom:12px' },
          avatar(c.first_name, { size: 'lg', customSrc: c.avatar, title: c.first_name }),
          el('h3', { style: 'margin:8px 0 2px' }, c.first_name),
          el('p', { class: 'muted', style: 'margin:0;font-size:.9rem' },
            'Total disponible : ' + totalAvail + ' pts (👛 ' + wBal + ' pts · 🐷 ' + sBal + ' pts)')),
        el('div', { class: 'card', style: 'background:#fef2f2;border-color:#fecaca;text-align:center' },
          el('strong', { style: 'color:var(--red);font-size:1.05rem' },
            'Il manque ' + diff + ' point' + (diff > 1 ? 's' : '') + ' pour « ' + r.label + ' »'),
          el('p', { style: 'font-size:.85rem;color:#991b1b;margin:4px 0 0' },
            'Prix : ' + r.cost + ' points. Continue les vols quotidiens pour atteindre l’objectif !'))),
      [{ label: 'Compris', class: 'btn-primary', onClick: close => close() }]);
      return;
    }

    // Curseur asservi + saisie numérique directe
    const maxWallet = Math.min(r.cost, wBal);
    const minWallet = Math.max(0, r.cost - sBal);
    let initialWallet = Math.min(r.cost, wBal);
    if (initialWallet < minWallet) initialWallet = minWallet;

    let curWallet = initialWallet;
    let curSavings = r.cost - curWallet;

    const inpW = el('input', {
      type: 'number', min: String(minWallet), max: String(maxWallet), value: String(curWallet),
      style: 'font-weight:800;font-size:1.15rem;color:var(--cyan-d);width:100px;text-align:center'
    });
    const inpS = el('input', {
      type: 'number', min: String(0), max: String(sBal), value: String(curSavings),
      style: 'font-weight:800;font-size:1.15rem;color:#a21caf;width:100px;text-align:center'
    });

    const slider = el('input', {
      type: 'range', class: 'app-slider', min: String(minWallet), max: String(maxWallet), step: '1', value: String(curWallet),
      style: 'width:100%;cursor:pointer;margin:10px 0'
    });

    const syncFromWallet = val => {
      val = Math.max(minWallet, Math.min(maxWallet, Number(val) || 0));
      curWallet = val;
      curSavings = r.cost - curWallet;
      slider.value = String(curWallet);
      inpW.value = String(curWallet);
      inpS.value = String(curSavings);
    };

    const syncFromSavings = val => {
      val = Math.max(0, Math.min(sBal, Number(val) || 0));
      curSavings = val;
      curWallet = r.cost - curSavings;
      if (curWallet > maxWallet) { curWallet = maxWallet; curSavings = r.cost - curWallet; }
      if (curWallet < minWallet) { curWallet = minWallet; curSavings = r.cost - curWallet; }
      slider.value = String(curWallet);
      inpW.value = String(curWallet);
      inpS.value = String(curSavings);
    };

    slider.addEventListener('input', () => syncFromWallet(slider.value));
    inpW.addEventListener('input', () => syncFromWallet(inpW.value));
    inpS.addEventListener('input', () => syncFromSavings(inpS.value));

    const body = el('div', {},
      el('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:12px;margin-bottom:14px' },
        avatar(c.first_name, { size: 'md', customSrc: c.avatar, title: c.first_name }),
        el('div', {},
          el('strong', { style: 'font-size:1.15rem;display:block' }, r.label),
          el('span', { class: 'muted', style: 'font-size:.85rem' },
            'Pour ' + c.first_name + ' · Prix exact : ' + r.cost + ' points'))),
      el('p', { class: 'muted', style: 'font-size:.88rem;margin:0 0 10px' },
        'Glissez le curseur ou saisissez les montants directement : les deux stocks s’ajustent automatiquement pour faire exactement ' + r.cost + ' points.'),
      el('div', { class: 'card', style: 'padding:14px;background:#fff;border:1px solid var(--line);border-radius:12px' },
        el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;margin-bottom:8px' },
          el('div', { style: 'background:#f0f9ff;border:1px solid #bae6fd;padding:10px 8px;border-radius:10px' },
            el('div', { style: 'font-size:.76rem;color:var(--muted);font-weight:700;margin-bottom:4px' }, 'Part Portefeuille 👛'),
            inpW,
            el('div', { style: 'font-size:.7rem;color:var(--muted);margin-top:4px' }, 'Dispo : ' + wBal + ' pts')),
          el('div', { style: 'background:#fdf4ff;border:1px solid #f5d0fe;padding:10px 8px;border-radius:10px' },
            el('div', { style: 'font-size:.76rem;color:var(--muted);font-weight:700;margin-bottom:4px' }, 'Part Tirelire 🐷✨'),
            inpS,
            el('div', { style: 'font-size:.7rem;color:var(--muted);margin-top:4px' }, 'Dispo : ' + sBal + ' pts'))),
        slider,
        el('div', { style: 'display:flex;justify-content:space-between;font-size:.76rem;color:var(--muted)' },
          el('span', {}, '👛 Max Portefeuille'),
          el('span', {}, '🐷✨ Max Tirelire'))),
      el('div', { style: 'margin-top:12px;padding:8px 12px;border-radius:10px;background:#f0fdf4;color:var(--green);font-weight:700;text-align:center;font-size:.9rem' },
        '✓ Total vérifié : ' + r.cost + ' points prélevés'));

    const { close } = modal('Attribuer : ' + r.label, body, [{
      label: '🎁 Confirmer l’attribution',
      class: 'btn-primary',
      onClick: async () => {
        close();
        await executeRedemption(r, [{ child_id: c.id, wallet_points: curWallet, savings_points: curSavings, points: r.cost }]);
      }
    }]);

  } else {
    // Cas collectif : pour tous les enfants actifs (Keyran, Rilès, Test, ...)
    const totalCollective = children.reduce((sum, k) => {
      const bo = balances.find(x => x.child_id === k.id) || {};
      return sum + (bo.wallet_balance ?? 0) + (bo.savings_balance ?? 0);
    }, 0);

    if (totalCollective < r.cost) {
      const diff = r.cost - totalCollective;
      modal('⚠️ Cagnotte collective insuffisante', el('div', {},
        el('div', { class: 'card', style: 'background:#fef2f2;border-color:#fecaca;text-align:center' },
          el('strong', { style: 'color:var(--red);font-size:1.05rem' },
            'Il manque ' + diff + ' point' + (diff > 1 ? 's' : '') + ' au total pour « ' + r.label + ' »'),
          el('p', { style: 'font-size:.85rem;color:#991b1b;margin:4px 0 0' },
            'Cagnotte disponible de la fratrie : ' + totalCollective + ' / ' + r.cost + ' points.'))),
      [{ label: 'Compris', class: 'btn-primary', onClick: close => close() }]);
      return;
    }

    // Initialisation équitable des parts par enfant (la somme fait exactement r.cost)
    const n = children.length;
    let childShares = distributePoints(r.cost, n);

    const kidsData = children.map((c, i) => {
      const bo = balances.find(x => x.child_id === c.id) || {};
      const wBal = bo.wallet_balance ?? 0;
      const sBal = bo.savings_balance ?? 0;
      const share = childShares[i];

      // Par défaut pour une sortie collective : 100% sur la Tirelire Magique (ou max dispo)
      const sPts = Math.min(share, sBal);
      const wPts = share - sPts;

      return {
        child: c,
        wBal, sBal,
        share,
        wPts, sPts,
        // Éléments DOM Étape 1
        shareSlider: null,
        shareInput: null,
        // Éléments DOM Étape 2
        partTitle: null,
        walletSlider: null,
        wInput: null,
        sInput: null
      };
    });

    const body = el('div', {},
      el('div', { style: 'padding:12px;background:#f8fafc;border-radius:12px;margin-bottom:12px' },
        el('strong', { style: 'font-size:1.15rem;display:block' }, r.label),
        el('span', { class: 'muted', style: 'font-size:.85rem' },
          'Sortie collective · Prix total : ' + r.cost + ' points')),
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:14px 0 6px' },
        el('h4', { style: 'margin:0;color:var(--navy)' }, '1. Répartition de la facture entre les enfants :'),
        el('button', {
          type: 'button', class: 'btn btn-sm btn-ghost', style: 'font-size:.76rem;font-weight:700',
          onclick: () => resetEquitable()
        }, '⚡ Répartir équitablement')),
      el('p', { class: 'muted', style: 'font-size:.82rem;margin:0 0 10px' },
        'Saisissez les parts ou bougez les curseurs : la compensation se fait en douceur sur les autres sans à-coups !'),
      el('div', { id: 'sharesContainer', style: 'display:grid;gap:12px' }),
      el('h4', { style: 'margin:20px 0 6px;color:#a21caf' }, '2. Prélèvement pour chaque enfant (Portefeuille vs Tirelire) :'),
      el('p', { class: 'muted', style: 'font-size:.82rem;margin:0 0 10px' },
        'Par défaut, 100 % de la sortie collective est pris sur la Tirelire Magique 🐷✨. Vous pouvez basculer des points sur le Portefeuille 👛 à votre guise.'),
      el('div', { id: 'walletSlidersContainer', style: 'display:grid;gap:12px' }),
      el('div', { style: 'margin-top:14px;padding:10px 12px;border-radius:10px;background:#f0fdf4;color:var(--green);font-weight:700;text-align:center' },
        '✓ Facture collective couverte à 100 % (' + r.cost + ' points)'));

    const sharesContainer = body.querySelector('#sharesContainer');
    const walletContainer = body.querySelector('#walletSlidersContainer');

    // Réinitialiser équitablement
    const resetEquitable = () => {
      childShares = distributePoints(r.cost, n);
      syncUI();
    };

    // Mettre à jour l'asservissement collectif lissé
    const updateAllShares = (changedIdx, newVal) => {
      childShares = adjustShares(childShares, changedIdx, newVal, r.cost);
      syncUI();
    };

    const syncUI = () => {
      kidsData.forEach((kd, idx) => {
        kd.share = childShares[idx];

        // Sync Étape 1
        if (kd.shareSlider) kd.shareSlider.value = String(kd.share);
        if (kd.shareInput) kd.shareInput.value = String(kd.share);

        // Sync Étape 2 (Dynamique et réactif !)
        if (kd.partTitle) {
          kd.partTitle.textContent = kd.child.first_name + ' (part : ' + kd.share + ' pts) :';
        }

        // Re-ventiler par défaut vers la tirelire magique
        const defS = Math.min(kd.share, kd.sBal);
        const defW = Math.max(0, kd.share - defS);
        kd.sPts = defS;
        kd.wPts = defW;

        if (kd.walletSlider) {
          const maxW = Math.min(kd.share, kd.wBal);
          const minW = Math.max(0, kd.share - kd.sBal);
          kd.walletSlider.min = String(minW);
          kd.walletSlider.max = String(maxW);
          if (kd.wPts < minW) kd.wPts = minW;
          if (kd.wPts > maxW) kd.wPts = maxW;
          kd.sPts = kd.share - kd.wPts;
          kd.walletSlider.value = String(kd.wPts);
        }
        if (kd.wInput) {
          kd.wInput.max = String(Math.min(kd.share, kd.wBal));
          kd.wInput.value = String(kd.wPts);
        }
        if (kd.sInput) {
          kd.sInput.max = String(Math.min(kd.share, kd.sBal));
          kd.sInput.value = String(kd.sPts);
        }
      });
    };

    // Construire Étape 1
    kidsData.forEach((kd, idx) => {
      const slider = el('input', {
        type: 'range', class: 'app-slider', min: '0', max: String(r.cost), step: '1', value: String(kd.share),
        style: 'width:100%;cursor:pointer;margin:6px 0'
      });
      const numInput = el('input', {
        type: 'number', min: '0', max: String(r.cost), value: String(kd.share),
        style: 'width:80px;font-weight:800;font-size:1.1rem;color:var(--navy);text-align:center'
      });

      kd.shareSlider = slider;
      kd.shareInput = numInput;

      slider.addEventListener('input', () => updateAllShares(idx, Number(slider.value)));
      numInput.addEventListener('input', () => updateAllShares(idx, Number(numInput.value)));

      const quickBtn = (delta, text) => el('button', {
        type: 'button', class: 'btn btn-sm btn-ghost',
        style: 'font-size:.72rem;padding:2px 6px;border:1px solid var(--line)',
        onclick: () => updateAllShares(idx, kd.share + delta)
      }, text);

      sharesContainer.append(el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff' },
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px' },
          el('div', { style: 'display:flex;align-items:center;gap:8px' },
            avatar(kd.child.first_name, { size: 'xs', customSrc: kd.child.avatar }),
            el('strong', {}, kd.child.first_name)),
          el('div', { style: 'display:flex;align-items:center;gap:6px' },
            quickBtn(-50, '-50'), quickBtn(-10, '-10'),
            numInput,
            quickBtn(10, '+10'), quickBtn(50, '+50'))),
        slider));
    });

    // Construire Étape 2 (Totalement synchronisée en direct avec l'Étape 1 !)
    kidsData.forEach((kd) => {
      const partTitle = el('strong', {}, kd.child.first_name + ' (part : ' + kd.share + ' pts) :');
      kd.partTitle = partTitle;

      const maxW = Math.min(kd.share, kd.wBal);
      const minW = Math.max(0, kd.share - kd.sBal);

      const wSlider = el('input', {
        type: 'range', class: 'app-slider', min: String(minW), max: String(maxW), step: '1', value: String(kd.wPts),
        style: 'width:100%;cursor:pointer;margin:6px 0'
      });

      const wInp = el('input', {
        type: 'number', min: String(minW), max: String(maxW), value: String(kd.wPts),
        style: 'width:70px;text-align:center;font-weight:700;color:var(--cyan-d)'
      });
      const sInp = el('input', {
        type: 'number', min: '0', max: String(Math.min(kd.share, kd.sBal)), value: String(kd.sPts),
        style: 'width:70px;text-align:center;font-weight:700;color:#a21caf'
      });

      kd.walletSlider = wSlider;
      kd.wInput = wInp;
      kd.sInput = sInp;

      const syncKidStocks = (fromW) => {
        if (fromW) {
          let val = Math.max(minW, Math.min(maxW, Number(wInp.value) || 0));
          kd.wPts = val;
          kd.sPts = kd.share - kd.wPts;
        } else {
          let val = Math.max(0, Math.min(kd.sBal, Number(sInp.value) || 0));
          kd.sPts = val;
          kd.wPts = kd.share - kd.sPts;
          if (kd.wPts > maxW) { kd.wPts = maxW; kd.sPts = kd.share - kd.wPts; }
          if (kd.wPts < minW) { kd.wPts = minW; kd.sPts = kd.share - kd.wPts; }
        }
        wSlider.value = String(kd.wPts);
        wInp.value = String(kd.wPts);
        sInp.value = String(kd.sPts);
      };

      wSlider.addEventListener('input', () => {
        wInp.value = wSlider.value;
        syncKidStocks(true);
      });
      wInp.addEventListener('input', () => syncKidStocks(true));
      sInp.addEventListener('input', () => syncKidStocks(false));

      walletContainer.append(el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff' },
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' },
          partTitle,
          el('div', { style: 'display:flex;gap:6px;font-size:.76rem;color:var(--muted)' },
            '👛 ' + kd.wBal + ' | 🐷 ' + kd.sBal)),
        el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;margin-bottom:6px' },
          el('div', { style: 'background:#f0f9ff;border:1px solid #bae6fd;padding:6px;border-radius:8px' },
            el('label', { style: 'font-size:.74rem;display:block;margin-bottom:2px' }, 'Portefeuille 👛'), wInp),
          el('div', { style: 'background:#fdf4ff;border:1px solid #f5d0fe;padding:6px;border-radius:8px' },
            el('label', { style: 'font-size:.74rem;display:block;margin-bottom:2px' }, 'Tirelire 🐷✨'), sInp)),
        wSlider,
        el('div', { style: 'display:flex;justify-content:space-between;font-size:.7rem;color:var(--muted)' },
          el('span', {}, '👛 Max Portefeuille'),
          el('span', {}, '🐷✨ Max Tirelire Magique'))));
    });

    const { close } = modal('Sortie collective : ' + r.label, body, [{
      label: '🎁 Confirmer la sortie collective',
      class: 'btn-primary',
      onClick: async () => {
        close();
        const shares = kidsData.map(kd => ({
          child_id: kd.child.id,
          wallet_points: kd.wPts,
          savings_points: kd.sPts,
          points: kd.share
        }));
        await executeRedemption(r, shares);
      }
    }]);
  }
}

async function executeRedemption(r, shares) {
  try {
    const red = await api.claimReward(r.id, shares);
    celebrateMilestone('🎁 ' + r.label);
    await load();
    render();
    toast('Récompense « ' + r.label + ' » attribuée !', 'ok', 6000);

    const totalPts = shares.reduce((s, k) => s + k.points, 0);
    undoBar('Récompense « ' + r.label + ' » (-' + totalPts + ' pts)', async () => {
      try {
        await api.cancelRedemption(red.id, 'Annulé dans les 10 secondes');
        await load();
        render();
        toast('Attribution annulée.');
      } catch (err) { fail(err); }
    });
  } catch (err) { fail(err); }
}

// ---------------------------------------------------------------------
// Section « Récompenses acquises » (Historique riche avec filtres & KPIs)
// ---------------------------------------------------------------------
function filterDivider(title) {
  return el('div', {
    class: 'filter-divider',
    style: 'display:flex;align-items:center;gap:10px;margin:14px 0 8px;color:var(--muted);font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700'
  },
    el('span', { style: 'flex:1;height:1px;background:var(--line)' }),
    el('span', {}, title),
    el('span', { style: 'flex:1;height:1px;background:var(--line)' }));
}

function renderHistorySection(app) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  // 1. Filtrage de base (enfant, nature intrinsèque de la récompense, période)
  const baseFiltered = rewardHistory.filter(red => {
    // Filtre enfant : l'enfant doit faire partie des bénéficiaires
    if (histFilterChild !== 'all') {
      const hasKid = (red.redemption_shares || []).some(s => s.child_id === histFilterChild);
      if (!hasKid) return false;
    }

    // Filtre nature : STRICTEMENT la nature intrinsèque de la récompense (scope)
    const intrinsicScope = red.rewards?.scope || red.scope || 'individual';
    if (histFilterScope === 'individual' && intrinsicScope !== 'individual') return false;
    if (histFilterScope === 'collective' && intrinsicScope !== 'collective') return false;

    // Filtre période (sur decided_at)
    const dateISO = (red.decided_at || '').slice(0, 10);
    if (histFilterTime === 'month' && dateISO < startOfMonth) return false;
    if (histFilterTime === 'quarter' && dateISO < startOfQuarter) return false;
    if (histFilterTime === 'year' && dateISO < startOfYear) return false;

    return true;
  });

  // 2. Décompte contextuel par récompense éligible
  const countForReward = r => baseFiltered.filter(red => red.reward_id === r.id).length;

  const activeAttributedRewards = rewards
    .map(r => ({ reward: r, count: countForReward(r) }))
    .filter(item => item.count > 0);

  if (histFilterRewardId !== 'all' && !activeAttributedRewards.some(item => item.reward.id === histFilterRewardId)) {
    histFilterRewardId = 'all';
  }

  // 3. Filtrage final (avec la récompense spécifique si choisie)
  const filtered = (histFilterRewardId === 'all')
    ? baseFiltered
    : baseFiltered.filter(red => red.reward_id === histFilterRewardId);

  const totalCount = filtered.length;
  let totalPtsWallet = 0;
  let totalPtsSavings = 0;

  filtered.forEach(red => {
    (red.redemption_shares || []).forEach(s => {
      totalPtsWallet += (s.wallet_points || 0);
      totalPtsSavings += (s.savings_points || 0);
      if (!s.wallet_points && !s.savings_points) {
        if (red.scope === 'collective') totalPtsSavings += (s.points || 0);
        else totalPtsWallet += (s.points || 0);
      }
    });
  });

  // 4. Composants de filtres avec séparateurs
  const childChips = el('div', { class: 'chips', style: 'gap:8px;justify-content:center' },
    el('button', {
      class: 'chip' + (histFilterChild === 'all' ? ' on' : ''),
      onclick: () => { histFilterChild = 'all'; render(); }
    }, 'Tous les enfants (' + rewardHistory.length + ')'),
    ...children.map(k => {
      const countForKid = rewardHistory.filter(red => (red.redemption_shares || []).some(s => s.child_id === k.id)).length;
      return el('button', {
        class: 'chip' + (histFilterChild === k.id ? ' on' : ''),
        style: 'display:inline-flex;align-items:center;gap:6px',
        onclick: () => { histFilterChild = k.id; render(); }
      },
        avatar(k.first_name, { size: 'xs', customSrc: k.avatar }),
        el('span', {}, k.first_name + ' (' + countForKid + ')'));
    })
  );

  const scopeChips = el('div', { class: 'chips', style: 'gap:6px;justify-content:center' },
    el('button', { class: 'chip' + (histFilterScope === 'all' ? ' on' : ''), onclick: () => { histFilterScope = 'all'; render(); } }, 'Toutes natures'),
    el('button', { class: 'chip' + (histFilterScope === 'individual' ? ' on' : ''), onclick: () => { histFilterScope = 'individual'; render(); } }, 'Individuelles 👛'),
    el('button', { class: 'chip' + (histFilterScope === 'collective' ? ' on' : ''), onclick: () => { histFilterScope = 'collective'; render(); } }, 'Collectives 🐷'));

  const timeChips = el('div', { class: 'chips', style: 'gap:6px;justify-content:center' },
    el('button', { class: 'chip' + (histFilterTime === 'all' ? ' on' : ''), onclick: () => { histFilterTime = 'all'; render(); } }, 'Tout l’historique'),
    el('button', { class: 'chip' + (histFilterTime === 'month' ? ' on' : ''), onclick: () => { histFilterTime = 'month'; render(); } }, 'Ce mois-ci'),
    el('button', { class: 'chip' + (histFilterTime === 'quarter' ? ' on' : ''), onclick: () => { histFilterTime = 'quarter'; render(); } }, 'Ce trimestre'),
    el('button', { class: 'chip' + (histFilterTime === 'year' ? ' on' : ''), onclick: () => { histFilterTime = 'year'; render(); } }, 'Cette année'));

  const rewardOptions = [
    el('option', { value: 'all' }, '— Toutes les récompenses attribuées (' + baseFiltered.length + ') —'),
    ...activeAttributedRewards.map(item =>
      el('option', { value: item.reward.id, selected: histFilterRewardId === item.reward.id },
        item.reward.label + ' (' + item.count + ')'))
  ];
  const rewardSelect = el('select', {
    style: 'font-weight:700;font-size:.95rem',
    onchange: e => { histFilterRewardId = e.target.value; render(); }
  }, ...rewardOptions);

  // 5. Carte récapitulative KPI
  const kpiBox = el('div', {
    class: 'card',
    style: 'background:linear-gradient(145deg,#0B2046,#123a74);color:#fff;padding:16px;border-radius:14px;margin-bottom:14px'
  },
    el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center' },
      el('div', {},
        el('div', { style: 'font-size:1.6rem;font-weight:900;color:var(--cyan)' }, String(totalCount)),
        el('div', { style: 'font-size:.74rem;opacity:.85;font-weight:600' }, 'Attributions réelles')),
      el('div', { style: 'border-left:1px solid rgba(255,255,255,.15);border-right:1px solid rgba(255,255,255,.15)' },
        el('div', { style: 'font-size:1.6rem;font-weight:900;color:#38bdf8' }, String(totalPtsWallet)),
        el('div', { style: 'font-size:.74rem;opacity:.85;font-weight:600' }, 'Pts Portefeuille 👛')),
      el('div', {},
        el('div', { style: 'font-size:1.6rem;font-weight:900;color:#f0abfc' }, String(totalPtsSavings)),
        el('div', { style: 'font-size:.74rem;opacity:.85;font-weight:600' }, 'Pts Tirelire 🐷'))));

  // 6. Assemblage
  app.append(el('div', { class: 'card' },
    el('h2', { style: 'margin:0 0 4px;text-align:center' }, 'Historique des récompenses obtenues'),
    el('p', { class: 'muted', style: 'margin:0 0 10px;text-align:center' }, 'Affinez l’affichage selon vos critères.'),
    filterDivider('👤 Bénéficiaire'),
    childChips,
    filterDivider('🏷️ Nature de la récompense'),
    scopeChips,
    filterDivider('📅 Période'),
    timeChips,
    filterDivider('🎯 Récompense spécifique'),
    rewardSelect
  ));

  app.append(kpiBox);

  if (filtered.length === 0) {
    app.append(el('div', { class: 'card', style: 'text-align:center;padding:32px 16px' },
      el('div', { style: 'font-size:2rem;margin-bottom:8px' }, '🔍'),
      el('strong', { style: 'display:block;font-size:1.05rem' }, 'Aucune récompense ne correspond à ces critères.'),
      el('p', { class: 'muted', style: 'font-size:.85rem;margin:4px 0 12px' }, 'Essayez d’élargir la période ou de réinitialiser vos filtres.'),
      el('button', {
        class: 'btn btn-sm btn-ghost',
        onclick: () => {
          histFilterChild = 'all'; histFilterScope = 'all'; histFilterTime = 'all'; histFilterRewardId = 'all';
          render();
        }
      }, 'Réinitialiser tous les filtres')));
  } else {
    app.append(el('div', { style: 'display:grid;gap:12px' },
      ...filtered.map(red => historyEntry(red))));
  }
}

function historyEntry(red) {
  const isCollective = (red.rewards?.scope || red.scope) === 'collective';
  const label = red.rewards?.label || 'Récompense';
  const rewardImg = red.rewards?.image_url || null;
  const dateStr = (red.decided_at || '').slice(0, 10);
  const shares = red.redemption_shares || [];

  return el('div', {
    class: 'entry',
    style: 'display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--line);border-radius:14px;background:#fff'
  },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px' },
      el('div', { style: 'display:flex;align-items:center;gap:12px;min-width:0' },
        rewardImg
          ? el('img', { src: rewardImg, style: 'width:64px;height:42px;border-radius:8px;object-fit:cover;border:1px solid var(--line);flex:none' })
          : el('div', { style: 'width:42px;height:42px;border-radius:8px;background:#f1f5f9;display:grid;place-items:center;font-size:1.3rem;flex:none' }, '🎁'),
        el('div', { style: 'min-width:0' },
          el('strong', { style: 'font-size:1.08rem;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, label),
          el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:2px' },
            el('span', { class: 'muted', style: 'font-size:.82rem' }, api.formatDate(dateStr)),
            el('span', {
              class: 'badge',
              style: isCollective ? 'background:#fdf4ff;color:#a21caf;font-size:.72rem' : 'background:#f0f9ff;color:var(--cyan-d);font-size:.72rem'
            }, isCollective ? '🐷 Sortie collective' : '👛 Récompense individuelle')))),
      el('div', { style: 'text-align:right;flex:none' },
        el('span', { class: 'neg', style: 'font-size:1.3rem;font-weight:900;display:block' }, '-' + red.cost_total + ' pts'),
        el('button', {
          class: 'btn btn-sm btn-ghost',
          style: 'color:var(--red);font-size:.74rem;padding:2px 8px;margin-top:2px',
          onclick: async () => {
            if (!window.confirm('Annuler l’attribution de « ' + label + ' » ?\n\nTous les points prélevés seront immédiatement restitués dans leurs stocks d’origine.')) return;
            try {
              await api.cancelRedemption(red.id, 'Annulation manuelle');
              await load();
              render();
              toast('Attribution annulée, points restitués !');
            } catch (err) { fail(err); }
          }
        }, 'Annuler'))),
    el('div', { style: 'border-top:1px solid var(--line);padding-top:8px;display:flex;flex-wrap:wrap;gap:8px' },
      ...shares.map(s => {
        const cName = s.children?.first_name || 'Enfant';
        const cAvatar = s.children?.avatar || null;
        const wp = s.wallet_points || 0;
        const sp = s.savings_points || 0;
        let detailPay = '';
        if (wp > 0 && sp > 0) detailPay = '(👛 ' + wp + ' + 🐷 ' + sp + ')';
        else if (wp > 0) detailPay = '(👛 Portefeuille)';
        else if (sp > 0) detailPay = '(🐷 Tirelire)';
        else detailPay = isCollective ? '(🐷 Tirelire)' : '(👛 Portefeuille)';

        return el('div', {
          style: 'display:inline-flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:3px 8px;font-size:.8rem'
        },
          avatar(cName, { size: 'xs', customSrc: cAvatar }),
          el('strong', {}, cName),
          el('span', { style: 'color:var(--navy);font-weight:700' }, '-' + s.points + ' pts'),
          el('span', { class: 'muted', style: 'font-size:.74rem' }, detailPay));
      }))
  );
}


export async function mount(container) {
  root = container;
  root.innerHTML = '<p class="muted">Chargement des récompenses…</p>';
  try {
    await load();
    render();
  } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try {
    await load();
    render();
  } catch (e) { fail(e); }
}
