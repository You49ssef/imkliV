/**
 * =============================================
 * IMKLI — supabaseClient.js
 * Initialise un client Supabase unique à partir
 * des valeurs définies dans config.js.
 *
 * Nécessite d'avoir chargé, dans cet ordre :
 *   1. config.js
 *   2. le CDN @supabase/supabase-js
 *   3. ce fichier
 * =============================================
 */

const imkliSupabase = window.supabase.createClient(
  IMKLI_CONFIG.SUPABASE_URL,
  IMKLI_CONFIG.SUPABASE_ANON_KEY
);
