import { PARENTS, signIn, sb } from './api.js';
import { $, el } from './ui.js';
import { initPWA } from './pwa.js';
import { initTouchFeedback } from './cinematics.js';
initPWA();
initTouchFeedback();

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) location.replace('index.html');
})();

let choisi = localStorage.getItem('ab_parent') || PARENTS[0].prenom;

function render() {
  const who = $('#who'); who.innerHTML = '';
  PARENTS.forEach(p => who.append(el('button', {
    type: 'button', class: p.prenom === choisi ? 'on' : '',
    onclick: () => { choisi = p.prenom; localStorage.setItem('ab_parent', choisi); render(); $('#pwd').focus(); }
  }, p.prenom)));
}
render();

$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#go'); btn.disabled = true; btn.textContent = 'Embarquement…';
  try {
    await signIn(choisi, $('#pwd').value);
    location.replace('index.html');
  } catch (err) {
    $('#msg').textContent = /Invalid login/i.test(err.message)
      ? 'Mot de passe incorrect.' : err.message;
    btn.disabled = false; btn.textContent = 'Embarquer';
  }
});
