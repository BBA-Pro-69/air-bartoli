// =====================================================================
//  Air Bartoli - mode application
//  Reprend les trois mécanismes de Chicago-Bruno-Chris :
//   1. un bandeau d'installation, masqué 7 jours si on le ferme ;
//   2. un bandeau de mise à jour dès qu'une nouvelle version est prête ;
//   3. un bouton d'installation présent dans l'en-tête ET dans le menu.
// =====================================================================
export const CACHE_VERSION = '2026-09-19aa';
const SNOOZE_KEY = 'ab_install_snooze';
const SNOOZE_DAYS = 7;

let deferredPrompt = null;
let registration = null;
let waitingWorker = null;
let reloading = false;

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const snoozed = () => Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch (_) {}
}

// ---------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------
export async function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    syncInstallUI();
    return choice.outcome === 'accepted';
  }
  if (isIOS()) {
    showSheetHelp("Sur iPhone : touche le bouton Partager en bas de Safari, puis « Sur l’écran d’accueil ».");
  } else {
    showSheetHelp("Ouvre le menu de ton navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».");
  }
  return false;
}

function showSheetHelp(text) {
  document.querySelector('.pwa-help')?.remove();
  const box = document.createElement('div');
  box.className = 'pwa-help';
  box.innerHTML = `<strong>Installer Keyrilès</strong><span>${text}</span>`;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer');
  close.textContent = '×';
  close.onclick = () => box.remove();
  box.append(close);
  document.body.append(box);
  setTimeout(() => box.remove(), 9000);
}

export function syncInstallUI() {
  const installed = isStandalone();
  const possible = !installed;
  document.querySelectorAll('[data-install]').forEach(b => { b.hidden = !possible; });
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  const show = possible && !snoozed();
  banner.classList.toggle('show', show);
  const txt = document.getElementById('installTxt');
  if (txt) {
    txt.textContent = isIOS()
      ? "Ajoute Keyrilès à ton écran d’accueil : Partager, puis « Sur l’écran d’accueil »."
      : "Installe Keyrilès pour l’ouvrir comme une vraie application, même hors connexion.";
  }
}

// ---------------------------------------------------------------------
// Mise à jour
// ---------------------------------------------------------------------
function showUpdateBanner() {
  document.getElementById('swBanner')?.classList.add('show');
  vibrate(12);
}
export function hideUpdateBanner() {
  document.getElementById('swBanner')?.classList.remove('show');
}

export function applyUpdate() {
  if (waitingWorker) {
    waitingWorker.postMessage('air-bartoli-skip-waiting');
    setTimeout(() => { if (!reloading) location.reload(); }, 1200);
  } else {
    location.reload();
  }
}

// Vérification manuelle, déclenchée depuis le menu.
export async function checkForUpdates() {
  if (!registration) return 'indisponible';
  try {
    await registration.update();
    if (registration.waiting) { waitingWorker = registration.waiting; showUpdateBanner(); return 'disponible'; }
    return 'a-jour';
  } catch (_) { return 'erreur'; }
}

function watch(reg) {
  registration = reg;
  if (reg.waiting && navigator.serviceWorker.controller) {
    waitingWorker = reg.waiting;
    showUpdateBanner();
  }
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    if (!next) return;
    next.addEventListener('statechange', () => {
      if (next.state === 'installed' && navigator.serviceWorker.controller) {
        waitingWorker = reg.waiting || next;
        showUpdateBanner();
      }
    });
  });
}

export function initPWA() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register(`./sw.js?v=${CACHE_VERSION}`).then(watch).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    // Nouvelle vérification au retour sur l'application.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {});
    });
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    syncInstallUI();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    localStorage.removeItem(SNOOZE_KEY);
    syncInstallUI();
  });

  document.getElementById('installGo')?.addEventListener('click', promptInstall);
  document.getElementById('installClose')?.addEventListener('click', () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 864e5));
    syncInstallUI();
  });
  document.getElementById('swGo')?.addEventListener('click', applyUpdate);
  document.getElementById('swLater')?.addEventListener('click', hideUpdateBanner);
  document.querySelectorAll('[data-install]').forEach(b => b.addEventListener('click', promptInstall));

  syncInstallUI();
}
