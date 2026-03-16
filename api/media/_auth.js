/**
 * Shared auth helper for api/media/* endpoints.
 * Verifies Supabase JWT from Authorization: Bearer header.
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Extract and verify Supabase JWT. Throws on failure. */
async function verifyAuth(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const token = auth.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return user;
}

/** Set CORS headers. Call before any method check. */
function cors(res, methods = "GET, POST, PUT, DELETE, OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin",  process.env.FRONTEND_URL || "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = { supabase, verifyAuth, cors };
