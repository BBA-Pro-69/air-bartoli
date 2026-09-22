import { PARENTS, getCrewLoginProfiles, signIn, sb } from './api.js';
import { $, el, avatar } from './ui.js';
import { initPWA } from './pwa.js';
import { initTouchFeedback } from './cinematics.js';
initPWA();
initTouchFeedback();

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) location.replace('index.html');
})();

let crewProfiles = [];
let choisiUser = null;

async function initLogin() {
  const who = $('#who');
  if (who) {
    who.innerHTML = '<p class="muted" style="font-size:.85rem;text-align:center;padding:10px 0">Chargement de l’équipage…</p>';
  }
  try {
    const list = await getCrewLoginProfiles();
    if (list && list.length > 0) {
      crewProfiles = list;
    } else {
      crewProfiles = PARENTS.map(p => ({
        user_id: p.prenom, display_name: p.prenom, role_title: 'Parent', avatar_url: null, email: p.email
      }));
    }
  } catch (_) {
    crewProfiles = PARENTS.map(p => ({
      user_id: p.prenom, display_name: p.prenom, role_title: 'Parent', avatar_url: null, email: p.email
    }));
  }

  const savedEmail = localStorage.getItem('ab_parent_email');
  const savedName = localStorage.getItem('ab_parent');
  choisiUser = crewProfiles.find(p => p.email === savedEmail || p.display_name === savedName) || crewProfiles[0];

  render();
}

function render() {
  const who = $('#who');
  if (!who) return;
  who.innerHTML = '';
  who.style.display = 'grid';
  who.style.gridTemplateColumns = 'repeat(auto-fit, minmax(110px, 1fr))';
  who.style.gap = '10px';
  who.style.marginBottom = '16px';

  crewProfiles.forEach(p => {
    const isSelected = choisiUser && (choisiUser.email === p.email || choisiUser.user_id === p.user_id);
    const btn = el('button', {
      type: 'button',
      class: 'crew-login-card' + (isSelected ? ' on' : ''),
      style: `display:flex;flex-direction:column;align-items:center;padding:12px 6px;border-radius:14px;border:2px solid ${isSelected ? 'var(--cyan)' : 'var(--line)'};background:${isSelected ? '#f0f9ff' : '#fff'};cursor:pointer;transition:all .15s;text-align:center`,
      onclick: () => {
        choisiUser = p;
        localStorage.setItem('ab_parent', p.display_name);
        if (p.email) localStorage.setItem('ab_parent_email', p.email);
        render();
        $('#pwd').focus();
      }
    },
      avatar(p.display_name, { size: 'sm', customSrc: p.avatar_url }),
      el('strong', { style: 'margin-top:6px;font-size:.95rem;color:var(--navy);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%' }, p.display_name),
      el('span', { class: 'muted', style: 'font-size:.7rem;margin-top:2px;display:block' }, p.role_title || 'Membre'));

    who.append(btn);
  });
}

$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#go');
  btn.disabled = true;
  btn.textContent = 'Embarquement…';
  try {
    if (!choisiUser || !choisiUser.email) throw new Error('Veuillez choisir un profil.');
    await signIn(choisiUser.email, $('#pwd').value);
    location.replace('index.html');
  } catch (err) {
    $('#msg').textContent = /Invalid login/i.test(err.message)
      ? 'Mot de passe incorrect.' : err.message;
    btn.disabled = false;
    btn.textContent = 'Embarquer';
  }
});

initLogin();
