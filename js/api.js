// Air Bartoli - socle d'acces aux donnees Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TIMEZONE } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

export function todayISO() {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: TIMEZONE }).format(new Date());
}
export function nowHour() {
  return parseInt(new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', hour12: false }).format(new Date()), 10);
}
export function currentDayPart() {
  const h = nowHour();
  return (DAY_PARTS.find(p => h >= p.from && h < p.to) || DAY_PARTS[4]).code;
}
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  const today = todayISO();
  if (iso === today) return "Aujourd'hui";
  const y = new Date(new Date(today + 'T12:00:00').getTime() - 86400000);
  if (iso === new Intl.DateTimeFormat('fr-CA').format(y)) return 'Hier';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}
export const dayPartLabel = c => (DAY_PARTS.find(p => p.code === c) || {}).label || '';

export const getCrewLoginProfiles = () => sb.rpc('get_crew_login_profiles').then(r => r.data || []);

export async function signIn(target, password) {
  let email = null;
  if (typeof target === 'string' && target.includes('@')) {
    email = target.trim();
  } else {
    const found = PARENTS.find(x => x.prenom === target || x.email === target);
    if (found) email = found.email;
    else {
      const profiles = await getCrewLoginProfiles().catch(() => []);
      const match = profiles.find(p => p.display_name === target || p.email === target || p.user_id === target);
      if (match) email = match.email;
    }
  }
  if (!email) throw new Error('Profil ou adresse email introuvable.');
  const { error } = await sb.auth.signInWithPassword({ email, password });
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
    .select('*, crew_roles(*)').eq('user_id', data.session.user.id).maybeSingle();
  if (!me) { location.href = 'login.html'; return null; }
  return me;
}

const rows = async (q) => { const { data, error } = await q; if (error) throw error; return data || []; };

export const getChildren   = () => rows(sb.from('children').select('*').eq('active', true).order('sort_order'));
export const getAllChildren = () => rows(sb.from('children').select('*').order('sort_order'));
export const getCategories = () => rows(sb.from('categories').select('*').eq('active', true).order('sort_order'));
export const getRewards    = () => rows(sb.from('rewards').select('*').order('cost'));
export const getBalances   = () => rows(sb.from('v_child_balance').select('*'));
export const getLevels     = () => rows(sb.from('v_child_level').select('*'));
export const getRates      = () => rows(sb.from('v_child_rate').select('*'));
export const getEligibility= () => rows(sb.from('v_reward_eligibility').select('*'));
export const getBoosterSettings = () => rows(sb.from('booster_settings').select('*').order('period_type'));
export const getSpecialDays= () => rows(sb.from('special_days').select('*').order('day', { ascending: false }));
export const getContexts   = () => rows(sb.from('custom_contexts').select('*').eq('active', true).order('sort_order'));
export const getParents    = () => rows(sb.from('parents').select('*, crew_roles(*)').order('created_at'));
export const getCrewRoles  = () => rows(sb.from('crew_roles').select('*').order('created_at'));

export async function getCinematicSettings() {
  const { data, error } = await sb.from('cinematic_settings').select('*').maybeSingle();
  if (error) throw error;
  return data || { level_1_min: 1, level_2_min: 5, level_3_min: 16 };
}
export const getSavingsSettings = () => sb.from('savings_settings').select('*').maybeSingle().then(r => r.data || { annual_interest_rate: 100.00, default_savings_pct: 70, active: true });

export const getDaily      = (since) => rows(sb.from('v_daily').select('*').gte('event_date', since).order('event_date'));
export const getEvents = (limit = 120) => rows(
  sb.from('events')
    .select('*, categories(label, parent_id, repairable), children(first_name, color, avatar)')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit));

export const getRedemptionsHistory = () => rows(
  sb.from('redemptions')
    .select('*, rewards(id, label, scope, cost, image_url), redemption_shares(child_id, points, wallet_points, savings_points, children(id, first_name, color, avatar))')
    .eq('state', 'approved')
    .order('decided_at', { ascending: false })
);

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message.replace(/^.*?:s*/, ''));
  return data;
}

export const addEvent = (child_id, category_id, points, date, day_part, note, force_kind = null, repairable = null) =>
  rpc('add_event', { p_child_id: child_id, p_category_id: category_id, p_points: points ?? null, p_date: date ?? null, p_day_part: day_part ?? null, p_note: note || null, p_force_kind: force_kind, p_repairable: repairable });
export const reverseEvent = (id, reason) => rpc('reverse_event', { p_event_id: id, p_reason: reason || null });
export const cancelRedemption = (id, reason) => rpc('cancel_redemption', { p_redemption_id: id, p_reason: reason || null });
export const repairEvent  = (id, note) => rpc('repair_event', { p_event_id: id, p_ratio: 0.5, p_note: note || null });
export const claimReward = (reward_id, shares) => rpc('claim_reward', { p_reward_id: reward_id, p_shares: shares });
export const applyPeriodBoosters = () => rpc('apply_period_boosters', {});
export const settleDailyPoints = () => rpc('settle_daily_points', {});
export const applyMonthlyInterest = () => rpc('apply_monthly_interest', {});
export const deleteCategory = (category_id) => rpc('delete_category', { p_category_id: category_id });
export const createCrewMember = (email, password, displayName, roleTitle, roleId = null) =>
  rpc('create_crew_member', { p_email: email, p_password: password, p_display_name: displayName, p_role_title: roleTitle || 'Membre d’équipage' });
export const updateCrewMember = (userId, displayName, roleTitle = null, avatarUrl = null, email = null, active = null, roleId = null) =>
  rpc('update_crew_member', { p_user_id: userId, p_display_name: displayName, p_role_title: roleTitle || null, p_avatar_url: avatarUrl || null, p_email: email || null, p_active: active !== null ? active : null, p_role_id: roleId || null });
export const removeCrewMember = (userId) => rpc('remove_crew_member', { p_user_id: userId });
export const archiveChild = (id) => update('children', id, { active: false });
export const restoreChild = (id) => update('children', id, { active: true });

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
export async function update(table, id, patch) {
  const { error } = await sb.from(table).update(patch).eq('id', id);
  if (error) throw error;
}
export async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}
export async function uploadMedia(fileBlob, folder = 'avatars', fileName = null) {
  const me = await requireSession();
  if (!me) throw new Error('Non connecté.');
  const name = fileName || `${me.family_id}/${folder}_${Date.now()}.jpg`;
  const { error } = await sb.storage.from('avatars').upload(name, fileBlob, { cacheControl: '3600', upsert: true });
  if (error) throw error;
  const { data: pub } = sb.storage.from('avatars').getPublicUrl(name);
  return pub.publicUrl;
}
