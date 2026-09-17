// Barre de navigation, injectee sur chaque page.
import { signOut, requireSession } from './api.js';
import { el, $ } from './ui.js';

const PAGES = [
  { href: 'index.html',      label: 'Saisie' },
  { href: 'enfant.html',     label: 'Enfants' },
  { href: 'historique.html', label: 'Historique' },
  { href: 'dashboard.html',  label: 'Analyse' },
  { href: 'reglages.html',   label: 'Réglages' }
];

export async function mountNav() {
  const me = await requireSession();
  if (!me) return null;
  const here = location.pathname.split('/').pop() || 'index.html';
  const nav = el('header', { class: 'nav' },
    el('a', { class: 'brand', href: 'index.html' },
      el('span', { class: 'brand-mark' }, '✈'),
      el('span', {}, 'Air Bartoli')),
    el('nav', { class: 'nav-links' },
      ...PAGES.map(p => el('a', { href: p.href, class: p.href === here ? 'on' : '' }, p.label))),
    el('button', { class: 'nav-user', title: 'Se déconnecter', onclick: signOut }, me.display_name));
  document.body.prepend(nav);
  return me;
}
