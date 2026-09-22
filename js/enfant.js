// =====================================================================
//  Ecran Récompenses (🎁) — Air Bartoli
//  1. Bandeau photo XL, solde total et répartition Portefeuille & Tirelire
//  2. Sous-onglets : « Individuelles 👛 » & « Collectives 🐷 »
//  3. Curseurs asservis (Portefeuille vs Tirelire) garantissant la somme exacte
//  4. Répartition multi-enfants automatique et intelligente (N enfants)
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

async function load() {
  const [c, lv, b, rw, elg, rt, evs] = await Promise.all([
    api.getChildren(), api.getLevels(), api.getBalances(),
    api.getRewards(), api.getEligibility(), api.getRates(),
    api.getEvents(200)
  ]);
  children = c.filter(k => k.active !== false);
  levels = lv;
  balances = b;
  rewards = rw;
  elig = elg;
  rates = rt;

  // Exclusion stricte des récompenses annulées (reverses_id existant ou state=cancelled)
  const reversedIds = new Set(evs.filter(e => e.reverses_id).map(e => e.reverses_id));
  rewardHistory = evs.filter(e => e.kind === 'reward' && !reversedIds.has(e.id) && e.redemptions?.state !== 'cancelled');

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
        'Projets communs pour toute la fratrie. Vous pouvez moduler la part prélevée sur le portefeuille et la tirelire de chaque enfant.'),
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
      onclick: ev => { ev.stopPropagation(); openAttributionModal(r); }
    }, '🎁 Attribuer cette récompense'));

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
// MODALE INTERACTIVE D'ATTRIBUTION AVEC CURSEURS ASSERVIS
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

    // Pop-up claire si les points totaux sont insuffisants
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

    // Curseur asservi portefeuille <-> tirelire magique
    // On peut prélever au maximum ce qui est disponible dans chaque stock
    const maxWallet = Math.min(r.cost, wBal);
    const minWallet = Math.max(0, r.cost - sBal);
    let initialWallet = Math.min(r.cost, wBal);
    if (initialWallet < minWallet) initialWallet = minWallet;

    let curWallet = initialWallet;
    let curSavings = r.cost - curWallet;

    const slider = el('input', {
      type: 'range', min: String(minWallet), max: String(maxWallet), step: '1', value: String(curWallet),
      style: 'width:100%;cursor:pointer;margin:10px 0'
    });

    const badgeW = el('strong', { style: 'font-size:1.25rem;color:var(--cyan-d)' }, curWallet + ' pts');
    const badgeS = el('strong', { style: 'font-size:1.25rem;color:#a21caf' }, curSavings + ' pts');

    const updateSliderUI = () => {
      curWallet = Number(slider.value);
      curSavings = r.cost - curWallet;
      badgeW.textContent = curWallet + ' pts';
      badgeS.textContent = curSavings + ' pts';
    };
    slider.addEventListener('input', updateSliderUI);

    const body = el('div', {},
      el('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:12px;margin-bottom:14px' },
        avatar(c.first_name, { size: 'md', customSrc: c.avatar, title: c.first_name }),
        el('div', {},
          el('strong', { style: 'font-size:1.15rem;display:block' }, r.label),
          el('span', { class: 'muted', style: 'font-size:.85rem' },
            'Pour ' + c.first_name + ' · Prix exact : ' + r.cost + ' points'))),
      el('p', { class: 'muted', style: 'font-size:.88rem;margin:0 0 10px' },
        'Déplacez le curseur pour choisir la répartition exacte. La somme fait automatiquement le montant requis :'),
      el('div', { class: 'card', style: 'padding:14px;background:#fff;border:1px solid var(--line);border-radius:12px' },
        el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;margin-bottom:8px' },
          el('div', { style: 'background:#f0f9ff;border:1px solid #bae6fd;padding:8px;border-radius:10px' },
            el('div', { style: 'font-size:.76rem;color:var(--muted);font-weight:700' }, 'Prélèvement Portefeuille 👛'),
            badgeW,
            el('div', { style: 'font-size:.7rem;color:var(--muted)' }, 'Dispo : ' + wBal + ' pts')),
          el('div', { style: 'background:#fdf4ff;border:1px solid #f5d0fe;padding:8px;border-radius:10px' },
            el('div', { style: 'font-size:.76rem;color:var(--muted);font-weight:700' }, 'Prélèvement Tirelire 🐷✨'),
            badgeS,
            el('div', { style: 'font-size:.7rem;color:var(--muted)' }, 'Dispo : ' + sBal + ' pts'))),
        slider,
        el('div', { style: 'display:flex;justify-content:space-between;font-size:.76rem;color:var(--muted)' },
          el('span', {}, '👛 Max Portefeuille'),
          el('span', {}, '🐷✨ Max Tirelire Magique'))),
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

    // Pour chaque enfant, on retient sa part portefeuille et tirelire
    // Par défaut pour une sortie collective : 100% sur la Tirelire Magique (ou max disponible)
    const kidsData = children.map((c, i) => {
      const bo = balances.find(x => x.child_id === c.id) || {};
      const wBal = bo.wallet_balance ?? 0;
      const sBal = bo.savings_balance ?? 0;
      const share = childShares[i];

      const sPts = Math.min(share, sBal);
      const wPts = share - sPts;

      return {
        child: c,
        wBal, sBal,
        share,
        wPts, sPts,
        // Éléments DOM
        shareSlider: null,
        shareBadge: null,
        walletSlider: null,
        wBadge: null,
        sBadge: null
      };
    });

    const body = el('div', {},
      el('div', { style: 'padding:12px;background:#f8fafc;border-radius:12px;margin-bottom:12px' },
        el('strong', { style: 'font-size:1.15rem;display:block' }, r.label),
        el('span', { class: 'muted', style: 'font-size:.85rem' },
          'Sortie collective · Prix total verrouillé : ' + r.cost + ' points')),
      el('h4', { style: 'margin:14px 0 6px;color:var(--navy)' }, '1. Répartition de la facture entre les enfants :'),
      el('p', { class: 'muted', style: 'font-size:.82rem;margin:0 0 10px' },
        'Glissez le curseur d’un enfant pour modifier sa part. La différence se reporte automatiquement et équitablement sur les autres !'),
      el('div', { id: 'sharesContainer', style: 'display:grid;gap:12px' }),
      el('h4', { style: 'margin:18px 0 6px;color:#a21caf' }, '2. Prélèvement pour chaque enfant (Portefeuille vs Tirelire) :'),
      el('p', { class: 'muted', style: 'font-size:.82rem;margin:0 0 10px' },
        'Par défaut, 100 % de la sortie collective est pris sur la Tirelire Magique 🐷✨. Déplacez le curseur individuel si vous souhaitez utiliser du Portefeuille 👛.'),
      el('div', { id: 'walletSlidersContainer', style: 'display:grid;gap:12px' }),
      el('div', { style: 'margin-top:14px;padding:10px 12px;border-radius:10px;background:#f0fdf4;color:var(--green);font-weight:700;text-align:center' },
        '✓ Facture collective couverte à 100 % (' + r.cost + ' points)'));

    const sharesContainer = body.querySelector('#sharesContainer');
    const walletContainer = body.querySelector('#walletSlidersContainer');

    // Mettre à jour l'asservissement collectif
    const updateAllShares = (changedIdx, newVal) => {
      newVal = Math.max(0, Math.min(r.cost, newVal));
      childShares[changedIdx] = newVal;
      const remaining = r.cost - newVal;

      // Répartir le reste sur les autres enfants
      const otherIndices = Array.from({ length: n }, (_, idx) => idx).filter(idx => idx !== changedIdx);
      if (otherIndices.length > 0) {
        const subParts = distributePoints(remaining, otherIndices.length);
        otherIndices.forEach((otherIdx, j) => {
          childShares[otherIdx] = subParts[j];
        });
      }

      // Synchroniser les sliders de parts et recalculer la ventilation portefeuille/tirelire
      kidsData.forEach((kd, idx) => {
        kd.share = childShares[idx];
        if (kd.shareSlider) kd.shareSlider.value = String(kd.share);
        if (kd.shareBadge) kd.shareBadge.textContent = kd.share + ' pts';

        // Re-ventiler portefeuille vs tirelire pour sa nouvelle part
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
        if (kd.wBadge) kd.wBadge.textContent = '👛 ' + kd.wPts + ' pts';
        if (kd.sBadge) kd.sBadge.textContent = '🐷✨ ' + kd.sPts + ' pts';
      });
    };

    // Construire le panneau Étape 1 : Part de chaque enfant
    kidsData.forEach((kd, idx) => {
      const slider = el('input', {
        type: 'range', min: '0', max: String(r.cost), step: '1', value: String(kd.share),
        style: 'width:100%;cursor:pointer'
      });
      const badge = el('strong', { style: 'font-size:1.1rem;color:var(--navy)' }, kd.share + ' pts');

      kd.shareSlider = slider;
      kd.shareBadge = badge;

      slider.addEventListener('input', () => {
        updateAllShares(idx, Number(slider.value));
      });

      sharesContainer.append(el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:#fff' },
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' },
          el('div', { style: 'display:flex;align-items:center;gap:8px' },
            avatar(kd.child.first_name, { size: 'xs', customSrc: kd.child.avatar }),
            el('strong', {}, kd.child.first_name)),
          badge),
        slider));
    });

    // Construire le panneau Étape 2 : Choix Portefeuille vs Tirelire par enfant
    kidsData.forEach((kd) => {
      const maxW = Math.min(kd.share, kd.wBal);
      const minW = Math.max(0, kd.share - kd.sBal);

      const wSlider = el('input', {
        type: 'range', min: String(minW), max: String(maxW), step: '1', value: String(kd.wPts),
        style: 'width:100%;cursor:pointer;margin:6px 0'
      });

      const wB = el('span', { style: 'background:#f0f9ff;color:var(--cyan-d);padding:2px 8px;border-radius:6px;border:1px solid #bae6fd;font-weight:700' }, '👛 ' + kd.wPts + ' pts');
      const sB = el('span', { style: 'background:#fdf4ff;color:#a21caf;padding:2px 8px;border-radius:6px;border:1px solid #f5d0fe;font-weight:700' }, '🐷✨ ' + kd.sPts + ' pts');

      kd.walletSlider = wSlider;
      kd.wBadge = wB;
      kd.sBadge = sB;

      wSlider.addEventListener('input', () => {
        kd.wPts = Number(wSlider.value);
        kd.sPts = kd.share - kd.wPts;
        wB.textContent = '👛 ' + kd.wPts + ' pts';
        sB.textContent = '🐷✨ ' + kd.sPts + ' pts';
      });

      walletContainer.append(el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:#fff' },
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px' },
          el('span', { style: 'font-weight:700' }, kd.child.first_name + ' (part : ' + kd.share + ' pts) :'),
          el('div', { style: 'display:flex;gap:6px;font-size:.82rem' }, wB, sB)),
        wSlider,
        el('div', { style: 'display:flex;justify-content:space-between;font-size:.72rem;color:var(--muted)' },
          el('span', {}, '👛 Tout Portefeuille'),
          el('span', {}, '🐷✨ Tout Tirelire Magique'))));
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
function renderHistorySection(app) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const filtered = rewardHistory.filter(e => {
    // Filtre enfant
    if (histFilterChild !== 'all' && e.child_id !== histFilterChild) return false;

    // Filtre type (Portefeuille vs Tirelire / scope)
    const scope = e.redemptions?.rewards?.scope || (e.wallet_target === 'savings' ? 'collective' : 'individual');
    if (histFilterScope === 'individual' && scope !== 'individual') return false;
    if (histFilterScope === 'collective' && scope !== 'collective') return false;

    // Filtre période
    if (histFilterTime === 'month' && e.event_date < startOfMonth) return false;
    if (histFilterTime === 'quarter' && e.event_date < startOfQuarter) return false;
    if (histFilterTime === 'year' && e.event_date < startOfYear) return false;

    // Filtre récompense spécifique
    if (histFilterRewardId !== 'all') {
      const matchId = e.redemptions?.reward_id === histFilterRewardId;
      const targetReward = rewards.find(r => r.id === histFilterRewardId);
      const matchNote = targetReward && e.note && e.note.includes(targetReward.label);
      if (!matchId && !matchNote) return false;
    }

    return true;
  });

  const totalCount = filtered.length;
  let totalPtsWallet = 0;
  let totalPtsSavings = 0;
  filtered.forEach(e => {
    const ptsVal = Math.abs(e.points || 0);
    if (e.wallet_target === 'savings') totalPtsSavings += ptsVal;
    else totalPtsWallet += ptsVal;
  });

  // Filtres enfants
  const childChips = el('div', { class: 'chips', style: 'gap:8px;margin-bottom:10px' },
    el('button', {
      class: 'chip' + (histFilterChild === 'all' ? ' on' : ''),
      onclick: () => { histFilterChild = 'all'; render(); }
    }, 'Tous les enfants (' + rewardHistory.length + ')'),
    ...children.map(k => {
      const countForKid = rewardHistory.filter(e => e.child_id === k.id).length;
      return el('button', {
        class: 'chip' + (histFilterChild === k.id ? ' on' : ''),
        style: 'display:inline-flex;align-items:center;gap:6px',
        onclick: () => { histFilterChild = k.id; render(); }
      },
        avatar(k.first_name, { size: 'xs', customSrc: k.avatar }),
        el('span', {}, k.first_name + ' (' + countForKid + ')'));
    })
  );

  // Filtres Type & Période
  const scopeChips = el('div', { class: 'chips', style: 'gap:6px' },
    el('button', { class: 'chip' + (histFilterScope === 'all' ? ' on' : ''), onclick: () => { histFilterScope = 'all'; render(); } }, 'Tous types'),
    el('button', { class: 'chip' + (histFilterScope === 'individual' ? ' on' : ''), onclick: () => { histFilterScope = 'individual'; render(); } }, 'Individuelles 👛'),
    el('button', { class: 'chip' + (histFilterScope === 'collective' ? ' on' : ''), onclick: () => { histFilterScope = 'collective'; render(); } }, 'Collectives 🐷'));

  const timeChips = el('div', { class: 'chips', style: 'gap:6px' },
    el('button', { class: 'chip' + (histFilterTime === 'all' ? ' on' : ''), onclick: () => { histFilterTime = 'all'; render(); } }, 'Tout l’historique'),
    el('button', { class: 'chip' + (histFilterTime === 'month' ? ' on' : ''), onclick: () => { histFilterTime = 'month'; render(); } }, 'Ce mois-ci'),
    el('button', { class: 'chip' + (histFilterTime === 'quarter' ? ' on' : ''), onclick: () => { histFilterTime = 'quarter'; render(); } }, 'Ce trimestre'),
    el('button', { class: 'chip' + (histFilterTime === 'year' ? ' on' : ''), onclick: () => { histFilterTime = 'year'; render(); } }, 'Cette année'));

  // Sélecteur par récompense spécifique
  const rewardOptions = [
    el('option', { value: 'all' }, '— Toutes les récompenses confondues —'),
    ...rewards.map(r => el('option', { value: r.id, selected: histFilterRewardId === r.id }, r.label + ' (' + r.cost + ' pts)'))
  ];
  const rewardSelect = el('select', {
    style: 'margin-top:6px;font-weight:600',
    onchange: e => { histFilterRewardId = e.target.value; render(); }
  }, ...rewardOptions);

  // KPI Header
  const kpiBox = el('div', {
    class: 'card',
    style: 'background:linear-gradient(145deg,#0B2046,#123a74);color:#fff;padding:16px;border-radius:14px;margin-bottom:14px'
  },
    el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center' },
      el('div', {},
        el('div', { style: 'font-size:1.6rem;font-weight:900;color:var(--cyan)' }, String(totalCount)),
        el('div', { style: 'font-size:.74rem;opacity:.85;font-weight:600' }, 'Récompenses')),
      el('div', { style: 'border-left:1px solid rgba(255,255,255,.15);border-right:1px solid rgba(255,255,255,.15)' },
        el('div', { style: 'font-size:1.6rem;font-weight:900;color:#38bdf8' }, String(totalPtsWallet)),
        el('div', { style: 'font-size:.74rem;opacity:.85;font-weight:600' }, 'Pts Portefeuille 👛')),
      el('div', {},
        el('div', { style: 'font-size:1.6rem;font-weight:900;color:#f0abfc' }, String(totalPtsSavings)),
        el('div', { style: 'font-size:.74rem;opacity:.85;font-weight:600' }, 'Pts Tirelire 🐷'))));

  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Historique des récompenses obtenues'),
    el('p', { class: 'muted', style: 'margin-top:-6px' }, 'Explorez les récompenses accordées selon vos critères.'),
    childChips,
    el('div', { class: 'row', style: 'gap:10px;margin-bottom:10px;flex-wrap:wrap' }, scopeChips, timeChips),
    champ('Filtrer sur une récompense spécifique', rewardSelect)
  ));

  app.append(kpiBox);

  if (filtered.length === 0) {
    app.append(el('div', { class: 'card', style: 'text-align:center;padding:32px 16px' },
      el('div', { style: 'font-size:2rem;margin-bottom:8px' }, '🔍'),
      el('strong', { style: 'display:block;font-size:1.05rem' }, 'Aucune récompense ne correspond à ces filtres.'),
      el('p', { class: 'muted', style: 'font-size:.85rem;margin:4px 0 12px' }, 'Essayez d’élargir vos critères ou de sélectionner une autre période.'),
      el('button', {
        class: 'btn btn-sm btn-ghost',
        onclick: () => {
          histFilterChild = 'all'; histFilterScope = 'all'; histFilterTime = 'all'; histFilterRewardId = 'all';
          render();
        }
      }, 'Réinitialiser tous les filtres')));
  } else {
    app.append(el('div', { style: 'display:grid;gap:10px' },
      ...filtered.map(e => historyEntry(e))));
  }
}

function historyEntry(e) {
  const c = kid(e.child_id);
  const isSavings = e.wallet_target === 'savings';
  const label = e.categories?.label || e.note || 'Récompense';
  const rewardImg = e.redemptions?.rewards?.image_url || null;

  return el('div', {
    class: 'entry',
    style: 'display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;gap:12px'
  },
    el('div', { style: 'display:flex;align-items:center;gap:12px;min-width:0' },
      rewardImg
        ? el('img', { src: rewardImg, style: 'width:56px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--line);flex:none' })
        : el('div', { style: 'width:40px;height:40px;border-radius:8px;background:#f1f5f9;display:grid;place-items:center;font-size:1.2rem;flex:none' }, '🎁'),
      el('div', { style: 'min-width:0' },
        el('strong', { style: 'font-size:1.02rem;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, label),
        el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap' },
          el('span', { style: 'display:inline-flex;align-items:center;gap:4px;font-size:.82rem;font-weight:700' },
            avatar(c.first_name, { size: 'xs', customSrc: c.avatar }),
            el('span', {}, c.first_name)),
          el('span', { class: 'muted', style: 'font-size:.78rem' }, '· ' + api.formatDate(e.event_date)),
          el('span', {
            class: 'badge',
            style: isSavings ? 'background:#fdf4ff;color:#a21caf;font-size:.7rem' : 'background:#f0f9ff;color:var(--cyan-d);font-size:.7rem'
          }, isSavings ? '🐷 Tirelire' : '👛 Portefeuille')))),
    el('div', { style: 'text-align:right;flex:none' },
      el('span', { class: 'neg', style: 'font-size:1.2rem;font-weight:900;display:block' }, pts(e.points)),
      e.redemption_id ? el('button', {
        class: 'btn btn-sm btn-ghost',
        style: 'color:var(--red);font-size:.74rem;padding:2px 6px;margin-top:2px',
        onclick: async () => {
          if (!window.confirm('Annuler l’attribution de « ' + label + ' » ?\n\nLes points seront immédiatement restitués dans le bon stock.')) return;
          try {
            await api.cancelRedemption(e.redemption_id, 'Annulation manuelle');
            await load();
            render();
            toast('Récompense annulée, points restitués !');
          } catch (err) { fail(err); }
        }
      }, 'Annuler') : null));
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
