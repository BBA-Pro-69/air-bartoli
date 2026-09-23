// Air Bartoli - coquille applicative avec RBAC
import { requireSession, signOut, getCinematicSettings, applyPeriodBoosters, settleDailyPoints, applyMonthlyInterest } from './api.js';
import { toast, fail, avatar } from './ui.js';
import { initPWA, checkForUpdates, syncInstallUI, vibrate, isStandalone } from './pwa.js';
import { initTouchFeedback, setCinematicThresholds } from './cinematics.js';
import * as saisie from './saisie.js';
import * as enfant from './enfant.js';
import * as historique from './historique.js';
import * as dashboard from './dashboard.js';
import * as reglages from './reglages.js';

const ALL_VIEWS = [
  { id: 'saisie',     title: 'Saisie',      short: 'Saisie',   icon: '＋', mod: saisie },
  { id: 'enfant',     title: 'Récompenses', short: 'Récomp.',  icon: '★',  mod: enfant },
  { id: 'historique', title: 'Journal',     short: 'Journal',  icon: '≡',  mod: historique },
  { id: 'dashboard',  title: 'Analyse',     short: 'Analyse',  icon: '◔',  mod: dashboard },
  { id: 'reglages',   title: 'Réglages',    short: 'Réglages', icon: '⚙',  mod: reglages }
];

let VIEWS = [...ALL_VIEWS];
let me = null;
let currentIndex = 0;
const mounted = new Set();

const byId = id => document.getElementById(id);
const viewNode = id => document.querySelector(`[data-view="${id}"]`);
const indexOf = id => Math.max(0, VIEWS.findIndex(v => v.id === id));

function canView(id) {
  if (me?.is_admin) return true;
  const p = me?.crew_roles?.permissions;
  if (id === 'reglages') return p?.settings?.enabled === true;
  return p?.views?.[id] !== false;
}

async function show(id, direction = 0) {
  if (!canView(id)) {
    toast('Accès réservé pour cette rubrique.');
    show('saisie');
    return;
  }
  const view = VIEWS.find(v => v.id === id) || VIEWS[0];
  currentIndex = indexOf(view.id);

  document.querySelectorAll('[data-view]').forEach(n => {
    n.classList.remove('on', 'from-left', 'from-right');
  });
  const node = viewNode(view.id);
  const classes = ['on', direction > 0 ? 'from-right' : direction < 0 ? 'from-left' : null].filter(Boolean);
  node.classList.add(...classes);

  document.querySelectorAll('[data-tab-btn]').forEach(b => {
    b.classList.toggle('on', b.dataset.tabBtn === view.id);
  });
  byId('viewTitle').textContent = view.title;
  byId('appMain').scrollTop = 0;
  history.replaceState(null, '', '#' + view.id);

  if (!mounted.has(view.id)) {
    mounted.add(view.id);
    await (view.id === 'reglages' ? view.mod.mount(node, me) : view.mod.mount(node));
  } else if (view.mod.refreshView) {
    view.mod.refreshView();
  }
  closeMenu();
}

function go(delta) {
  const next = currentIndex + delta;
  if (next < 0 || next >= VIEWS.length) return;
  vibrate(8);
  show(VIEWS[next].id, delta);
}

function enableSwipe(zone) {
  let x0 = null, y0 = null, locked = false;
  const scrollableX = target =>
    !!target.closest?.('.chips, .chip, .subtabs-bar, .subtab-btn, .no-swipe, input[type="range"], table, .modal, .tile');

  zone.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    if (scrollableX(e.target)) { x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    locked = false;
  }, { passive: true });

  zone.addEventListener('touchmove', e => {
    if (x0 === null) return;
    const dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (!locked && Math.abs(dy) > Math.abs(dx)) { x0 = null; return; }
    if (Math.abs(dx) > 12) locked = true;
  }, { passive: true });

  zone.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 62 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function openMenu() {
  const menu = byId('appmenu');
  const sheet = menu.querySelector('.am-sheet');
  if (sheet) sheet.style.transform = '';
  menu.classList.add('show');
  document.body.classList.add('menu-open');
  document.querySelector('[data-tab-btn="menu"]')?.classList.add('opened');
}

function closeMenu() {
  const menu = byId('appmenu');
  const sheet = menu.querySelector('.am-sheet');
  if (sheet) sheet.style.transform = '';
  menu.classList.remove('show');
  document.body.classList.remove('menu-open');
  document.querySelector('[data-tab-btn="menu"]')?.classList.remove('opened');
}

(async function boot() {
  try {
    initPWA();
    initTouchFeedback();
    me = await requireSession();
    if (!me) return;

    void applyPeriodBoosters().catch(e => console.warn('Boosters', e));
    void Promise.all([settleDailyPoints(), applyMonthlyInterest()]).catch(e => console.warn('Epargne/Interets', e));
    try { setCinematicThresholds(await getCinematicSettings()); } catch (_) {}

    if (me.theme) document.documentElement.setAttribute('data-theme', me.theme);

    // Filtrer les vues visibles selon les permissions de l'utilisateur
    VIEWS = ALL_VIEWS.filter(v => canView(v.id));

    byId('userName').replaceChildren(avatar(me.display_name, { size: 'xs', customSrc: me.avatar_url }), document.createElement('span'));
    byId('userName').lastElementChild.textContent = me.display_name;
    byId('appShell').hidden = false;
    byId('bootScreen')?.remove();

    // Barre basse (onglets accessibles)
    const row = byId('tabRow');
    row.innerHTML = '';
    VIEWS.filter(v => v.id !== 'reglages').forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tabbtn';
      b.dataset.tabBtn = v.id;
      b.innerHTML = `<span class="tabicon">${v.icon}</span><span>${v.short}</span><span class="dotmark"></span>`;
      b.onclick = () => { vibrate(8); show(v.id, indexOf(v.id) > currentIndex ? 1 : -1); };
      row.append(b);
    });

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'tabbtn menu';
    menuBtn.dataset.tabBtn = 'menu';
    menuBtn.innerHTML = '<span class="tabicon">☰</span><span>Menu</span><span class="dotmark"></span>';
    menuBtn.onclick = () => { vibrate(8); byId('appmenu').classList.contains('show') ? closeMenu() : openMenu(); };
    row.append(menuBtn);

    // Liens du menu
    const grid = byId('menuGrid');
    grid.innerHTML = '';
    VIEWS.forEach(v => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'am-tile';
      t.innerHTML = `<span class="am-ico">${v.icon}</span><span>${v.title}</span>`;
      t.onclick = () => show(v.id, indexOf(v.id) > currentIndex ? 1 : -1);
      grid.append(t);
    });

    byId('menuBg').onclick = closeMenu;
    byId('menuClose').onclick = closeMenu;
    byId('btnLogout').onclick = signOut;

    enableSwipe(byId('appMain'));

    const start = location.hash.replace('#', '') || 'saisie';
    await show(VIEWS.some(v => v.id === start) ? start : VIEWS[0]?.id || 'saisie');
  } catch (error) {
    console.error('Boot error', error);
  }
})();
