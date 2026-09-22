// =====================================================================
//  Ecran Récompenses (🎁) — Air Bartoli
//  1. Bandeau photo XL, solde total et répartition Portefeuille & Tirelire
//  2. Sous-onglets : « Individuelles 👛 » & « Collectives 🐷 »
//  3. Choix précis du stock de prélèvement (Portefeuille vs Tirelire) par enfant
//  4. Historique des récompenses acquises avec annulation
// =====================================================================
import * as api from './api.js';
import { el, pts, toast, fail, modal, gauge, undoBar, avatar } from './ui.js';
import { celebrateMilestone } from './cinematics.js';

let root = null;
let children = [], levels = [], balances = [], rewards = [], elig = [], rates = [], rewardHistory = [];
let current = null;
let mainSection = 'catalog'; // 'catalog' | 'history'
let currentTab = 'individual'; // 'individual' | 'collective'

const bal   = id => (balances.find(b => b.child_id === id) || {}).balance ?? 0;
const rate  = id => (rates.find(r => r.child_id === id) || {}).weekly_rate ?? 0;
const level = id => levels.find(l => l.child_id === id) || {};
const kid   = id => children.find(c => c.id === id) || {};

async function load() {
  const [c, lv, b, rw, elg, rt, evs] = await Promise.all([
    api.getChildren(), api.getLevels(), api.getBalances(),
    api.getRewards(), api.getEligibility(), api.getRates(),
    api.getEvents(120)
  ]);
  children = c.filter(k => k.active !== false);
  levels = lv;
  balances = b;
  rewards = rw;
  elig = elg;
  rates = rt;

  const reversedIds = new Set(evs.filter(e => e.reverses_id).map(e => e.reverses_id));
  rewardHistory = evs.filter(e => e.kind === 'reward' && !reversedIds.has(e.id));

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
  const walletPts = balObj.wallet_balance ?? b;
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
    { id: 'history', label: '📜 Récompenses acquises' }
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
// MODALE INTERACTIVE D'ATTRIBUTION (CHOIX PORTEFEUILLE VS TIRELIRE)
// ---------------------------------------------------------------------
function openAttributionModal(r) {
  const isCollective = r.scope === 'collective';

  if (!isCollective) {
    // Cas individuel : pour l'enfant sélectionné
    const c = kid(current);
    const bo = balances.find(x => x.child_id === current) || {};
    const wBal = bo.wallet_balance ?? 0;
    const sBal = bo.savings_balance ?? 0;

    // Répartition initiale suggérée : prioritairement le portefeuille
    const defaultWallet = Math.min(r.cost, wBal);
    const defaultSavings = Math.min(r.cost - defaultWallet, sBal);

    const inputWallet = el('input', {
      type: 'number', min: '0', max: String(wBal), value: String(defaultWallet),
      style: 'font-weight:700;font-size:1.1rem;color:var(--cyan-d)'
    });
    const inputSavings = el('input', {
      type: 'number', min: '0', max: String(sBal), value: String(defaultSavings),
      style: 'font-weight:700;font-size:1.1rem;color:#a21caf'
    });

    const sumBox = el('div', { class: 'card', style: 'background:#f8fafc;margin-top:12px;border:1px solid var(--line);text-align:center' });
    const btnConfirm = el('button', { class: 'btn btn-primary btn-block', style: 'width:100%;margin-top:14px' }, '🎁 Confirmer l’attribution');

    const updateCalc = () => {
      const wp = Number(inputWallet.value) || 0;
      const sp = Number(inputSavings.value) || 0;
      const sum = wp + sp;
      const ok = (sum === r.cost);

      sumBox.innerHTML = '';
      if (ok) {
        sumBox.append(
          el('div', { style: 'color:var(--green);font-weight:800;font-size:1.05rem' }, '✓ Total prélevé : ' + sum + ' / ' + r.cost + ' points'),
          el('div', { class: 'muted', style: 'font-size:.82rem;margin-top:2px' },
            wp + ' pts sur le Portefeuille 👛 et ' + sp + ' pts sur la Tirelire Magique 🐷✨'));
        btnConfirm.disabled = false;
        btnConfirm.classList.remove('btn-ghost');
        btnConfirm.classList.add('btn-primary');
      } else {
        const diff = r.cost - sum;
        sumBox.append(
          el('div', { style: 'color:var(--red);font-weight:800;font-size:1.05rem' },
            'Total saisi : ' + sum + ' / ' + r.cost + ' points'),
          el('div', { style: 'color:var(--red);font-size:.84rem;margin-top:2px' },
            diff > 0 ? ('Il manque encore ' + diff + ' point(s) pour couvrir le prix.') : ('Le total dépasse le prix de ' + Math.abs(diff) + ' point(s).')));
        btnConfirm.disabled = true;
        btnConfirm.classList.remove('btn-primary');
        btnConfirm.classList.add('btn-ghost');
      }
    };

    inputWallet.addEventListener('input', updateCalc);
    inputSavings.addEventListener('input', updateCalc);
    updateCalc();

    const body = el('div', {},
      el('div', { style: 'display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f8fafc;border-radius:12px;margin-bottom:14px' },
        avatar(c.first_name, { size: 'md', customSrc: c.avatar, title: c.first_name }),
        el('div', {},
          el('strong', { style: 'font-size:1.1rem;display:block' }, r.label),
          el('span', { class: 'muted', style: 'font-size:.85rem' }, 'Pour ' + c.first_name + ' · Prix : ' + r.cost + ' points'))),
      el('p', { class: 'muted', style: 'font-size:.88rem;margin-bottom:12px' },
        'Choisissez librement combien de points prélever sur chaque stock de l’enfant :'),
      el('div', { class: 'fields' },
        champ('Sur le Portefeuille 👛 (disponible : ' + wBal + ' pts)', inputWallet),
        champ('Sur la Tirelire Magique 🐷✨ (disponible : ' + sBal + ' pts)', inputSavings)),
      sumBox,
      btnConfirm);

    const { close } = modal('Attribuer : ' + r.label, body, []);

    btnConfirm.onclick = async () => {
      const wp = Number(inputWallet.value) || 0;
      const sp = Number(inputSavings.value) || 0;
      if (wp + sp !== r.cost) return;
      close();
      await executeRedemption(r, [{ child_id: c.id, wallet_points: wp, savings_points: sp, points: wp + sp }]);
    };

  } else {
    // Cas collectif : pour tous les enfants
    const kidsInputs = children.map(c => {
      const bo = balances.find(x => x.child_id === c.id) || {};
      const wBal = bo.wallet_balance ?? 0;
      const sBal = bo.savings_balance ?? 0;
      const suggestedPerChild = Math.round(r.cost / children.length);

      // Suggéré en priorité sur la tirelire magique
      const defSavings = Math.min(suggestedPerChild, sBal);
      const defWallet = Math.min(suggestedPerChild - defSavings, wBal);

      const inpW = el('input', { type: 'number', min: '0', max: String(wBal), value: String(defWallet), style: 'width:80px' });
      const inpS = el('input', { type: 'number', min: '0', max: String(sBal), value: String(defSavings), style: 'width:80px' });
      return { child: c, wBal, sBal, inpW, inpS };
    });

    const sumBox = el('div', { class: 'card', style: 'background:#f8fafc;margin-top:12px;border:1px solid var(--line);text-align:center' });
    const btnConfirm = el('button', { class: 'btn btn-primary btn-block', style: 'width:100%;margin-top:14px' }, '🎁 Confirmer la sortie collective');

    const updateCalc = () => {
      let totalW = 0, totalS = 0;
      kidsInputs.forEach(k => {
        totalW += (Number(k.inpW.value) || 0);
        totalS += (Number(k.inpS.value) || 0);
      });
      const grandTotal = totalW + totalS;
      const ok = (grandTotal === r.cost);

      sumBox.innerHTML = '';
      if (ok) {
        sumBox.append(
          el('div', { style: 'color:var(--green);font-weight:800;font-size:1.05rem' }, '✓ Total collectif réparti : ' + grandTotal + ' / ' + r.cost + ' points'),
          el('div', { class: 'muted', style: 'font-size:.82rem;margin-top:2px' },
            'Total Portefeuille : ' + totalW + ' pts · Total Tirelire : ' + totalS + ' pts'));
        btnConfirm.disabled = false;
        btnConfirm.classList.remove('btn-ghost');
        btnConfirm.classList.add('btn-primary');
      } else {
        const diff = r.cost - grandTotal;
        sumBox.append(
          el('div', { style: 'color:var(--red);font-weight:800;font-size:1.05rem' },
            'Total réparti : ' + grandTotal + ' / ' + r.cost + ' points'),
          el('div', { style: 'color:var(--red);font-size:.84rem;margin-top:2px' },
            diff > 0 ? ('Il manque encore ' + diff + ' point(s) pour couvrir la sortie.') : ('Le total dépasse le prix de ' + Math.abs(diff) + ' point(s).')));
        btnConfirm.disabled = true;
        btnConfirm.classList.remove('btn-primary');
        btnConfirm.classList.add('btn-ghost');
      }
    };

    kidsInputs.forEach(k => {
      k.inpW.addEventListener('input', updateCalc);
      k.inpS.addEventListener('input', updateCalc);
    });
    updateCalc();

    const body = el('div', {},
      el('div', { style: 'padding:10px 12px;background:#f8fafc;border-radius:12px;margin-bottom:12px' },
        el('strong', { style: 'font-size:1.1rem;display:block' }, r.label),
        el('span', { class: 'muted', style: 'font-size:.85rem' }, 'Sortie collective · Prix total : ' + r.cost + ' points')),
      el('p', { class: 'muted', style: 'font-size:.88rem;margin-bottom:12px' },
        'Définissez pour chaque enfant la part prélevée sur son Portefeuille et sur sa Tirelire Magique :'),
      el('div', { style: 'display:grid;gap:12px' },
        ...kidsInputs.map(k => el('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:#fff' },
          el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' },
            el('div', { style: 'display:flex;align-items:center;gap:8px' },
              avatar(k.child.first_name, { size: 'xs', customSrc: k.child.avatar }),
              el('strong', {}, k.child.first_name)),
            el('div', { style: 'font-size:.76rem;color:var(--muted)' },
              '👛 ' + k.wBal + ' pts · 🐷 ' + k.sBal + ' pts')),
          el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
            el('div', {}, el('label', { style: 'font-size:.76rem;margin-bottom:2px' }, 'Part Portefeuille 👛'), k.inpW),
            el('div', {}, el('label', { style: 'font-size:.76rem;margin-bottom:2px' }, 'Part Tirelire 🐷✨'), k.inpS))))),
      sumBox,
      btnConfirm);

    const { close } = modal('Sortie collective : ' + r.label, body, []);

    btnConfirm.onclick = async () => {
      const shares = kidsInputs.map(k => {
        const wp = Number(k.inpW.value) || 0;
        const sp = Number(k.inpS.value) || 0;
        return { child_id: k.child.id, wallet_points: wp, savings_points: sp, points: wp + sp };
      });
      const grandTotal = shares.reduce((s, k) => s + k.points, 0);
      if (grandTotal !== r.cost) return;
      close();
      await executeRedemption(r, shares);
    };
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
// Section « Récompenses acquises » (Historique)
// ---------------------------------------------------------------------
function renderHistorySection(app) {
  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Récompenses déjà obtenues'),
    el('p', { class: 'muted', style: 'margin-top:-6px' },
      'Historique chronologique des récompenses accordées aux enfants.'),
    rewardHistory.length
      ? el('div', { class: 'rewards-history', style: 'display:grid;gap:10px;margin-top:14px' },
          ...rewardHistory.map(e => historyEntry(e)))
      : el('p', { class: 'muted', style: 'text-align:center;padding:24px 0' }, 'Aucune récompense acquise pour l’instant.')));
}

function historyEntry(e) {
  const c = kid(e.child_id);
  const targetDesc = e.wallet_target === 'savings' ? '🐷 Tirelire Magique' : '👛 Portefeuille';
  return el('div', { class: 'entry', style: 'display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff' },
    el('div', { style: 'display:flex;align-items:center;gap:12px' },
      avatar(c.first_name, { size: 'sm', customSrc: c.avatar }),
      el('div', {},
        el('strong', { style: 'font-size:1.02rem;display:block' }, e.categories?.label || e.note || 'Récompense'),
        el('div', { class: 'muted', style: 'font-size:.8rem' },
          c.first_name + ' · ' + api.formatDate(e.event_date) + ' · ' + targetDesc))),
    el('span', { class: 'neg', style: 'font-size:1.1rem;font-weight:800' }, pts(e.points)));
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
