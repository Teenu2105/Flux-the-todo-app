// =====================================================================
// SUPABASE CONFIGURATION
// =====================================================================
// Paste your project's values below. These come from:
// Supabase Dashboard → Project Settings → API
//
// SUPABASE_URL   → "Project URL"
// SUPABASE_ANON_KEY → "anon public" key (sometimes labelled "publishable key")
//
// SAFE to put in frontend code: Project URL, anon/public key.
// NEVER put in frontend code: the "service_role" secret key. That key
// bypasses Row Level Security entirely and must only ever live on a
// secure server. This app never needs it.
// =====================================================================

const SUPABASE_URL = "https://lgvcfmaqulaoiawncczx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TmwceKHDmzDov1wVE-UU5Q_pSdOcLjE";

// Creates the shared Supabase client used by database.js
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
