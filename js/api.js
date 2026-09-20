// =====================================================================
//  Air Bartoli - socle d'acces aux donnees
//  Toute la communication avec Supabase passe par ce fichier.
//  Aucune autre page n'importe supabase-js directement.
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TIMEZONE } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Les deux comptes parents. Les prenoms sont affiches, les adresses ne le
// sont jamais : sur un telephone, deux boutons valent mieux qu'un champ.
export const PARENTS = [
  { prenom: 'Névine', email: 'nevine.bartoli@gmail.com' },
  { prenom: 'Bruno',  email: 'bruno.s.bartoli@gmail.com' }
];

export const DAY_PARTS = [
  { code: 'matin',  label: 'Matin',  from: 0,  to: 9  },
  { code: 'ecole',  label: 'École',  from: 9,  to: 12 },
  { code: 'midi',   label: 'Midi',   from: 12, to: 15 },
  { code: 'gouter', label: 'Goûter', from: 15, to: 18 },
  { code: 'soir',   label: 'Soir',   from: 18, to: 22 },
  { code: 'nuit',   label: 'Nuit',   from: 22, to: 24 }
];

// ---------------------------------------------------------------------
// Dates : TOUJOURS en heure de Paris, jamais en UTC. Une saisie a 23h
// ne doit pas etre comptee la veille.
// ---------------------------------------------------------------------
export function todayISO() {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: TIMEZONE }).format(new Date());
}
export function nowHour() {
  return parseInt(new Intl.DateTimeFormat('fr-FR',
    { timeZone: TIMEZONE, hour: '2-digit', hour12: false }).format(new Date()), 10);
}
export function currentDayPart() {
  const h = nowHour();
  return (DAY_PARTS.find(p => h >= p.from && h < p.to) || DAY_PARTS[4]).code;
}
export function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  const today = todayISO();
  if (iso === today) return "Aujourd'hui";
  const y = new Date(new Date(today + 'T12:00:00').getTime() - 86400000);
  if (iso === new Intl.DateTimeFormat('fr-CA').format(y)) return 'Hier';
  return new Intl.DateTimeFormat('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}
export const dayPartLabel = c =>
  (DAY_PARTS.find(p => p.code === c) || {}).label || '';

// ---------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------
export async function signIn(prenom, password) {
  const p = PARENTS.find(x => x.prenom === prenom);
  if (!p) throw new Error('Parent inconnu.');
  const { error } = await sb.auth.signInWithPassword({ email: p.email, password });
  if (error) throw error;
}
export async function signOut() {
  await sb.auth.signOut();
  location.href = 'login.html';
}
export async function requireSession() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = 'login.html'; return null; }
  const { data: me } = await sb.from('parents')
    .select('user_id, display_name, family_id, avatar_url, theme').eq('user_id', data.session.user.id).maybeSingle();
  if (!me) {
    document.body.innerHTML =
      '<div class="boot-error"><h1>Compte non rattaché</h1><p>Ce compte existe mais ' +
      "n'est lié à aucune famille. Exécuter <code>sql/99-parents-bootstrap.sql</code>." +
      '</p></div>';
    return null;
  }
  return me;
}

// ---------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------
const rows = async (q) => { const { data, error } = await q; if (error) throw error; return data || []; };

export const getChildren   = () => rows(sb.from('children').select('*').eq('active', true).order('sort_order'));
export const getCategories = () => rows(sb.from('categories').select('*').eq('active', true).order('sort_order'));
export const getCategoriesForHistory = () => rows(sb.from('categories').select('*').order('sort_order'));
export const getRewards    = () => rows(sb.from('rewards').select('*').order('cost'));
export const getBalances   = () => rows(sb.from('v_child_balance').select('*'));
export const getLevels     = () => rows(sb.from('v_child_level').select('*'));
export const getRates      = () => rows(sb.from('v_child_rate').select('*'));
export const getEligibility= () => rows(sb.from('v_reward_eligibility').select('*'));
export const getBoosterSettings = () => rows(sb.from('booster_settings').select('*').order('period_type'));
export const getStatusLevels=() => rows(sb.from('status_levels').select('*').order('min_points'));
export const getSpecialDays= () => rows(sb.from('special_days').select('*').order('day', { ascending: false }));
export const getContexts   = () => rows(sb.from('custom_contexts').select('*').eq('active', true).order('sort_order'));
export async function getCinematicSettings() {
  const { data, error } = await sb.from('cinematic_settings').select('*').maybeSingle();
  if (error) throw error;
  return data || { level_1_min: 1, level_2_min: 5, level_3_min: 16 };
}
export const getDaily      = (since) => rows(sb.from('v_daily').select('*').gte('event_date', since).order('event_date'));
export const getProfile    = () => rows(sb.from('v_category_profile').select('*'));

export const getEvents = (limit = 120) => rows(
  sb.from('events')
    .select('*, categories(label, parent_id, repairable), children(first_name, color)')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit));

export const getDailyRange = (from, to) => rows(
  sb.from('v_daily').select('*').gte('event_date', from).lte('event_date', to)
    .order('event_date').order('child_id'));

export const getEventsRange = (from, to, childId = null) => {
  let q = sb.from('events')
    .select('*, categories(label, parent_id, repairable), children(first_name, color)')
    .gte('event_date', from).lte('event_date', to)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (childId) q = q.eq('child_id', childId);
  return rows(q);
};

export const getPendingRedemptions = () => rows(
  sb.from('redemptions')
    .select('*, rewards(label, scope, cost, min_per_child), redemption_shares(child_id, points)')
    .eq('state', 'requested').order('requested_at'));

// ---------------------------------------------------------------------
// Ecritures : uniquement par appel de fonction, jamais d'insert direct.
// ---------------------------------------------------------------------
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
  return data;
}
export const addEvent = (child_id, category_id, points, date, day_part, note, force_kind = null, repairable = null) =>
  rpc('add_event', { p_child_id: child_id, p_category_id: category_id,
                     p_points: points ?? null, p_date: date ?? null,
                     p_day_part: day_part ?? null, p_note: note || null,
                     p_force_kind: force_kind, p_repairable: repairable });
export const reverseEvent = (id, reason) => rpc('reverse_event', { p_event_id: id, p_reason: reason || null });
export const cancelRedemption = (id, reason) => rpc('cancel_redemption', { p_redemption_id: id, p_reason: reason || null });
export const repairEvent  = (id, note)   => rpc('repair_event',  { p_event_id: id, p_ratio: 0.5, p_note: note || null });
export const requestRedemption = (reward_id, shares) =>
  rpc('request_redemption', { p_reward_id: reward_id, p_shares: shares });
export const approveRedemption = (id) => rpc('approve_redemption', { p_redemption_id: id });
export const claimReward = (reward_id, shares) => rpc('claim_reward', { p_reward_id: reward_id, p_shares: shares });
export const applyPeriodBoosters = () => rpc('apply_period_boosters', {});
export const deleteCategory = (category_id) => rpc('delete_category', { p_category_id: category_id });

// Tables de parametrage : ecriture directe autorisee par la RLS.
export async function save(table, row) {
  const { data, error } = await sb.from(table).upsert(row).select();
  if (error) throw error;
  return data;
}
export async function insert(table, row) {
  const { data, error } = await sb.from(table).insert(row).select();
  if (error) throw error;
  return data;
}
// Mise a jour partielle. A NE PAS confondre avec save() : un upsert
// exige toutes les colonnes NOT NULL, meme quand la ligne existe deja.
export async function update(table, id, patch) {
  const { error } = await sb.from(table).update(patch).eq('id', id);
  if (error) throw error;
}
export async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Upload d'image vers Supabase Storage (bucket 'avatars')
// ---------------------------------------------------------------------
export async function uploadMedia(fileBlob, folder = 'avatars', fileName = null) {
  const me = await requireSession();
  if (!me) throw new Error('Non connecté.');
  const name = fileName || `${me.family_id}/${folder}_${Date.now()}.jpg`;
  const { data, error } = await sb.storage.from('avatars').upload(name, fileBlob, {
    cacheControl: '3600',
    upsert: true
  });
  if (error) throw error;
  const { data: pub } = sb.storage.from('avatars').getPublicUrl(name);
  return pub.publicUrl;
}

export const getParents = () => rows(sb.from('parents').select('*'));
export async function updateParentProfile({ display_name, avatar_url, theme }) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Non connecté.');
  const updates = {};
  if (display_name !== undefined) updates.display_name = display_name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (theme !== undefined) updates.theme = theme;
  const { data, error } = await sb.from('parents').update(updates).eq('user_id', session.user.id).select().single();
  if (error) throw error;
  return data;
}
