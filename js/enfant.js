import * as api from './api.js';
import { el, pts, toast, fail, modal, gauge, undoBar, avatar } from './ui.js';
import { celebrateMilestone } from './cinematics.js';

let root = null;
let children = [], levels = [], balances = [], rewards = [], elig = [], rates = [], rewardHistory = [];
let current = null;
let mainSection = 'catalog';
let currentTab = 'individual';

let histFilterChild = 'all';
let histFilterScope = 'all';
let histFilterTime  = 'all';
let histFilterRewardId = 'all';

const bal   = id => (balances.find(b => b.child_id === id) || {}).balance ?? 0;
const rate  = id => (rates.find(r => r.child_id === id) || {}).weekly_rate ?? 0;
const level = id => levels.find(l => l.child_id === id) || {};
const kid   = id => children.find(c => c.id === id) || {};

function champ(label, input) {
  return el('div', { class: 'field' }, el('label', {}, label), input);
}

function distributePoints(total, n) {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => i < rem ? base + 1 : base);
}

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
      if (available.length === 0) { res[changedIdx] -= needed; break; }
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

  const diff = total - res.reduce((s, v) => s + v, 0);
  if (diff !== 0) {
    for (const idx of otherIndices) {
      if (res[idx] + diff >= 0) { res[idx] += diff; break; }
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
  rewardHistory = redHist || [];

  if (!current || !children.some(k => k.id === current)) {
    current = children[0]?.id;
  }
}

function etaText(days) {
  if (days === null || days === undefined) return 'continue à gagner des points';
  if (days <= 0)  return 'prêt à être obtenu !';
  if (days === 1) return 'pour demain';
  if (days <= 14) return 'dans ' + days + ' jours';
  return 'dans environ ' + Math.round(days / 7) + ' semaines';
}

function divider(title) {
  return el('div', { class: 'section-divider' }, el('span', {}, title));
}

function render() {
  const c = kid(current), lv = level(current), b = bal(current);
  const app = root;
  app.innerHTML = '';

  app.append(el('div', { class: 'chips', style: 'margin-bottom:14px;justify-content:center;gap:14px' },
    ...children.map(k => el('button', {
      class: 'chip' + (k.id === current ? ' on' : ''),
      style: 'border-radius:999px;padding:4px 10px;min-height:50px',
      onclick: () => { current = k.id; render(); }
    }, avatar(k.first_name, { size: 'md', customSrc: k.avatar, title: k.first_name })))));

  const balObj = balances.find(x => x.child_id === current) || {};
  const walletPts = balObj.wallet_balance ?? 0;
  const savingsPts = balObj.savings_balance ?? 0;

  app.append(el('div', { class: 'hero', style: `background:linear-gradient(150deg,${c.color},#0B2046);padding:22px 16px;text-align:center` },
    avatar(c.first_name, { size: 'xl', customSrc: c.avatar }),
    el('div', { class: 'hero-balance', style: 'font-size:2.8rem;margin-top:4px' }, String(b)),
    el('div', { class: 'hero-sub', style: 'font-size:.9rem;opacity:.9;margin-bottom:10px' }, 'points disponibles acquis'),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:380px;margin:10px auto 0' },
      el('div', { style: 'background:rgba(255,255,255,.16);padding:10px 6px;border-radius:14px;text-align:center' },
        el('div', { style: 'font-size:1.3rem' }, '👛'),
        el('div', { style: 'font-size:1.4rem;font-weight:900;color:#fff' }, String(walletPts)),
        el('div', { style: 'font-size:.76rem;color:#fff' }, 'Portefeuille')),
      el('div', { style: 'background:rgba(255,255,255,.16);padding:10px 6px;border-radius:14px;text-align:center' },
        el('div', { style: 'font-size:1.3rem' }, '🐷✨'),
        el('div', { style: 'font-size:1.4rem;font-weight:900;color:#fff' }, String(savingsPts)),
        el('div', { style: 'font-size:.76rem;color:#fff' }, 'Tirelire Magique')))));

  app.append(divider('Récompenses'));

  const mainTabs = [
    { id: 'catalog', label: '🎁 Récompenses à gagner' },
    { id: 'history', label: '📜 Récompenses acquises (' + rewardHistory.length + ')' }
  ];

  app.append(el('div', { class: 'chips', style: 'margin-bottom:16px;justify-content:center;gap:10px' },
    ...mainTabs.map(t => el('button', {
      class: 'chip' + (mainSection === t.id ? ' on' : ''),
      onclick: () => { mainSection = t.id; render(); }
    }, t.label))));

  if (mainSection === 'catalog') renderCatalogSection(app);
  else renderHistorySection(app);
}

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
      el('div', { class: 'rewards' }, ...indRewards.map(r => rewardCard(r)))));
  } else {
    app.append(el('div', { class: 'card' },
      el('h2', {}, 'Récompenses collectives'),
      el('div', { class: 'rewards' }, ...colRewards.map(r => collectiveCard(r)))));
  }
}

function rewardCard(r) {
  const bo = balances.find(x => x.child_id === current) || {};
  const totalAvailable = (bo.wallet_balance ?? 0) + (bo.savings_balance ?? 0);
  const isOutOfStock = r.stock !== null && r.stock !== undefined && r.stock <= 0;
  const isLastItem = r.stock === 1;
  const ready = totalAvailable >= r.cost && !isOutOfStock;

  let stockBadge = null;
  if (isOutOfStock) stockBadge = el('span', { class: 'badge', style: 'background:#fee2e2;color:#991b1b;font-size:.72rem' }, 'Rupture de stock / Épuisé');
  else if (isLastItem) stockBadge = el('span', { class: 'badge', style: 'background:#fef3c7;color:#b45309;font-size:.72rem' }, '📦 Dernier exemplaire !');
  else if (r.stock !== null && r.stock !== undefined) stockBadge = el('span', { class: 'badge', style: 'background:#f1f5f9;color:var(--muted);font-size:.72rem' }, '📦 ' + r.stock + ' restants');

  return el('div', {
    class: 'reward' + (ready ? ' ready' : ''),
    style: 'cursor:pointer;' + (isOutOfStock ? 'opacity:.6;' : ''),
    onclick: () => openAttributionModal(r)
  },
    r.image_url ? el('img', { src: r.image_url, class: 'reward-img' }) : null,
    el('div', { class: 'reward-top' },
      el('div', {}, el('strong', {}, r.label), stockBadge),
      el('span', { class: 'reward-cost' }, r.cost + ' pts')),
    el('div', { style: 'margin:10px 0 6px' }, gauge(totalAvailable, r.cost, kid(current).color)),
    el('button', {
      type: 'button', class: 'btn btn-primary btn-block reward-action-btn',
      style: 'margin-top:12px;width:100%',
      disabled: isOutOfStock,
      onclick: ev => { ev.stopPropagation(); openAttributionModal(r); }
    }, isOutOfStock ? 'Épuisé' : '🎁 Attribuer cette récompense'));
}

function collectiveCard(r) {
  const totalAvailable = children.reduce((sum, c) => {
    const bo = balances.find(x => x.child_id === c.id) || {};
    return sum + (bo.wallet_balance ?? 0) + (bo.savings_balance ?? 0);
  }, 0);
  const isOutOfStock = r.stock !== null && r.stock !== undefined && r.stock <= 0;
  const ready = totalAvailable >= r.cost && !isOutOfStock;

  return el('div', {
    class: 'reward' + (ready ? ' ready' : ''),
    style: 'cursor:pointer;' + (isOutOfStock ? 'opacity:.6;' : ''),
    onclick: () => openAttributionModal(r)
  },
    r.image_url ? el('img', { src: r.image_url, class: 'reward-img' }) : null,
    el('div', { class: 'reward-top' },
      el('div', {}, el('strong', {}, r.label)),
      el('span', { class: 'reward-cost' }, r.cost + ' pts')),
    el('div', { style: 'margin:10px 0 6px' }, gauge(totalAvailable, r.cost, '#a21caf')),
    el('button', {
      type: 'button', class: 'btn btn-primary btn-block reward-action-btn',
      style: 'margin-top:12px;width:100%',
      disabled: isOutOfStock,
      onclick: ev => { ev.stopPropagation(); openAttributionModal(r); }
    }, isOutOfStock ? 'Épuisé' : '🎁 Attribuer cette sortie collective'));
}

function openAttributionModal(r) {
  if (r.stock !== null && r.stock !== undefined && r.stock <= 0) {
    modal('📦 Récompense épuisée', el('p', { class: 'muted', style: 'text-align:center;padding:10px 0' }, 'Cette récompense est temporairement en rupture de stock.'), [{ label: 'Compris', class: 'btn-primary', onClick: c => c() }]);
    return;
  }

  const isCollective = r.scope === 'collective';

  if (!isCollective) {
    const c = kid(current);
    const bo = balances.find(x => x.child_id === current) || {};
    const wBal = bo.wallet_balance ?? 0;
    const sBal = bo.savings_balance ?? 0;
    const totalAvail = wBal + sBal;

    if (totalAvail < r.cost) {
      modal('⚠️ Points insuffisants', el('p', { class: 'muted', style: 'text-align:center;padding:10px 0' }, 'Il manque ' + (r.cost - totalAvail) + ' points pour débloquer « ' + r.label + ' ».'), [{ label: 'Compris', class: 'btn-primary', onClick: c => c() }]);
      return;
    }

    const maxW = Math.min(r.cost, wBal);
    const minW = Math.max(0, r.cost - sBal);
    let curW = Math.max(minW, Math.min(r.cost, wBal));
    let curS = r.cost - curW;

    const inpW = el('input', { type: 'number', min: String(minW), max: String(maxW), value: String(curW), style: 'width:90px;text-align:center;font-weight:800;color:var(--cyan-d)' });
    const inpS = el('input', { type: 'number', min: '0', max: String(sBal), value: String(curS), style: 'width:90px;text-align:center;font-weight:800;color:#a21caf' });
    const slider = el('input', { type: 'range', class: 'app-slider', min: String(minW), max: String(maxW), step: '1', value: String(curW) });

    const syncW = val => {
      val = Math.max(minW, Math.min(maxW, Number(val) || 0));
      curW = val; curS = r.cost - curW;
      slider.value = String(curW); inpW.value = String(curW); inpS.value = String(curS);
    };
    slider.oninput = () => syncW(slider.value);
    inpW.oninput = () => syncW(inpW.value);
    inpS.oninput = () => {
      const sVal = Math.max(0, Math.min(sBal, Number(inpS.value) || 0));
      syncW(r.cost - sVal);
    };

    const body = el('div', {},
      el('p', { class: 'muted' }, 'Répartition du paiement pour ' + c.first_name + ' :'),
      el('div', { class: 'card', style: 'padding:14px;background:#fff' },
        el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center' },
          el('div', {}, el('label', {}, 'Portefeuille 👛'), inpW),
          el('div', {}, el('label', {}, 'Tirelire 🐷✨'), inpS)),
        slider),
      el('div', { style: 'margin-top:10px;padding:8px;background:#f0fdf4;color:var(--green);text-align:center;font-weight:700' }, '✓ Total : ' + r.cost + ' points'));

    const { close } = modal('Attribuer : ' + r.label, body, [{
      label: '🎁 Confirmer l’attribution', class: 'btn-primary',
      onClick: async () => {
        close();
        await executeRedemption(r, [{ child_id: c.id, wallet_points: curW, savings_points: curS, points: r.cost }]);
      }
    }]);

  } else {
    // Cas collectif multi-enfants
    const n = children.length;
    let childShares = distributePoints(r.cost, n);

    const kidsData = children.map((c, i) => {
      const bo = balances.find(x => x.child_id === c.id) || {};
      const share = childShares[i];
      const sPts = Math.min(share, bo.savings_balance ?? 0);
      const wPts = share - sPts;
      return { child: c, wBal: bo.wallet_balance ?? 0, sBal: bo.savings_balance ?? 0, share, wPts, sPts };
    });

    const body = el('div', {},
      el('p', { class: 'muted' }, 'Sortie collective de ' + r.cost + ' points :'),
      el('div', { id: 'sharesBox' }),
      el('div', { style: 'margin-top:10px;padding:8px;background:#f0fdf4;color:var(--green);text-align:center;font-weight:700' }, '✓ Facture collective couverte (' + r.cost + ' pts)'));

    const sharesBox = body.querySelector('#sharesBox');

    const renderCollectiveRows = () => {
      sharesBox.innerHTML = '';
      kidsData.forEach((kd, idx) => {
        const inp = el('input', { type: 'number', value: String(kd.share), style: 'width:70px;text-align:center;font-weight:700' });
        inp.oninput = () => {
          childShares = adjustShares(childShares, idx, Number(inp.value) || 0, r.cost);
          kidsData.forEach((k, j) => {
            k.share = childShares[j];
            k.sPts = Math.min(k.share, k.sBal);
            k.wPts = k.share - k.sPts;
          });
          renderCollectiveRows();
        };

        sharesBox.append(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid var(--line)' },
          el('span', {}, kd.child.first_name),
          el('div', { style: 'display:flex;align-items:center;gap:6px' },
            el('span', { class: 'muted', style: 'font-size:.78rem' }, '👛 ' + kd.wPts + ' + 🐷 ' + kd.sPts + ' = '),
            inp)));
      });
    };
    renderCollectiveRows();

    const { close } = modal('Sortie collective : ' + r.label, body, [{
      label: '🎁 Confirmer la sortie', class: 'btn-primary',
      onClick: async () => {
        close();
        const shares = kidsData.map(kd => ({ child_id: kd.child.id, wallet_points: kd.wPts, savings_points: kd.sPts, points: kd.share }));
        await executeRedemption(r, shares);
      }
    }]);
  }
}

async function executeRedemption(r, shares) {
  try {
    const red = await api.claimReward(r.id, shares);
    celebrateMilestone('🎁 ' + r.label);
    await load(); render();
    toast('Récompense attribuée !');
    const totalPts = shares.reduce((s, k) => s + k.points, 0);
    undoBar('Récompense « ' + r.label + ' » (-' + totalPts + ' pts)', async () => {
      await api.cancelRedemption(red.id, 'Annulation');
      await load(); render(); toast('Annulé.');
    });
  } catch (e) { fail(e); }
}

function filterDivider(title) {
  return el('div', { class: 'filter-divider', style: 'display:flex;align-items:center;gap:10px;margin:14px 0 8px;color:var(--muted);font-size:.76rem;text-transform:uppercase;font-weight:700' },
    el('span', { style: 'flex:1;height:1px;background:var(--line)' }),
    el('span', {}, title),
    el('span', { style: 'flex:1;height:1px;background:var(--line)' }));
}

function renderHistorySection(app) {
  const filtered = rewardHistory.filter(red => {
    if (histFilterChild !== 'all' && !(red.redemption_shares || []).some(s => s.child_id === histFilterChild)) return false;
    const isCol = (red.rewards?.scope || red.scope) === 'collective';
    if (histFilterScope === 'individual' && isCol) return false;
    if (histFilterScope === 'collective' && !isCol) return false;
    if (histFilterRewardId !== 'all' && red.reward_id !== histFilterRewardId) return false;
    return true;
  });

  app.append(el('div', { class: 'card' },
    el('h2', {}, 'Historique des récompenses'),
    filterDivider('Bénéficiaire'),
    el('div', { class: 'chips' },
      el('button', { class: 'chip' + (histFilterChild === 'all' ? ' on' : ''), onclick: () => { histFilterChild = 'all'; render(); } }, 'Tous les enfants'),
      ...children.map(k => el('button', { class: 'chip' + (histFilterChild === k.id ? ' on' : ''), onclick: () => { histFilterChild = k.id; render(); } }, k.first_name))),
    filterDivider('Nature'),
    el('div', { class: 'chips' },
      el('button', { class: 'chip' + (histFilterScope === 'all' ? ' on' : ''), onclick: () => { histFilterScope = 'all'; render(); } }, 'Toutes natures'),
      el('button', { class: 'chip' + (histFilterScope === 'individual' ? ' on' : ''), onclick: () => { histFilterScope = 'individual'; render(); } }, 'Individuelles 👛'),
      el('button', { class: 'chip' + (histFilterScope === 'collective' ? ' on' : ''), onclick: () => { histFilterScope = 'collective'; render(); } }, 'Collectives 🐷')),
    el('div', { style: 'display:grid;gap:10px;margin-top:14px' },
      ...filtered.map(red => historyEntry(red)))));
}

function historyEntry(red) {
  const isCol = (red.rewards?.scope || red.scope) === 'collective';
  const label = red.rewards?.label || 'Récompense';
  return el('div', { style: 'display:flex;justify-content:space-between;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff' },
    el('div', {},
      el('strong', {}, label),
      el('span', { class: 'badge', style: isCol ? 'background:#fdf4ff;color:#a21caf;font-size:.72rem' : 'background:#f0f9ff;color:var(--cyan-d);font-size:.72rem' }, isCol ? '🐷 Sortie collective' : '👛 Récompense individuelle'),
      el('div', { class: 'muted', style: 'font-size:.8rem' }, (red.decided_at || '').slice(0, 10))),
    el('div', { style: 'text-align:right' },
      el('span', { class: 'neg', style: 'font-size:1.2rem;font-weight:900' }, '-' + red.cost_total + ' pts'),
      el('button', { class: 'btn btn-sm btn-ghost', style: 'color:var(--red)', onclick: async () => {
        if (!window.confirm('Annuler ?')) return;
        await api.cancelRedemption(red.id, 'Annulation');
        await load(); render(); toast('Annulé.');
      } }, 'Annuler')));
}

export async function mount(container) {
  root = container;
  root.innerHTML = '<p class="muted">Chargement…</p>';
  try { await load(); render(); } catch (e) { fail(e); }
}

export async function refreshView() {
  if (!root) return;
  try { await load(); render(); } catch (e) { fail(e); }
}
