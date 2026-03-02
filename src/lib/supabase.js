import { createClient } from "@supabase/supabase-js";

// Reads the env vars you already have set in Vercel:
//   SUPABASE_URL              → your project URL
//   SUPABASE_SERVICE_ROLE_KEY → your key
// (exposed to the browser via envPrefix in vite.config.js)
const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

function initSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    return createClient(supabaseUrl, supabaseKey);
  } catch {
    return null;
  }
}

export const supabase = initSupabase();
