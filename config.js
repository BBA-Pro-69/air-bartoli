// =====================================================================
//  Air Bartoli - configuration du front
//  Projet Supabase : air-bartoli (dgsvpxeqwdyeudqubayd), region eu-west-3
// =====================================================================
//  Ces deux valeurs sont PUBLIABLES. La cle ci-dessous ne donne aucun
//  droit par elle-meme : la seule barriere est la Row Level Security,
//  qui filtre tout sur family_id = auth_family_id().
//  Ne JAMAIS mettre ici la cle service_role : elle contourne la RLS.
// =====================================================================

export const SUPABASE_URL = 'https://dgsvpxeqwdyeudqubayd.supabase.co';

// Cle publishable (format moderne, rotation independante).
export const SUPABASE_ANON_KEY = 'sb_publishable_HJjVxDDPmIjKIQ_VC4FoPA_MxUaLJaP';

// Identifiants metier, resolus au demarrage par js/api.js.
export const APP_NAME     = 'Air Bartoli';
export const PROGRAM_NAME = 'Keyrilès';
export const TIMEZONE     = 'Europe/Paris';
