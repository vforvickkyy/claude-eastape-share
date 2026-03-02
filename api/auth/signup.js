const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  const origin = process.env.FRONTEND_URL || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password, fullName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  // Create user with admin API — email_confirm:true skips verification email
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    user_metadata: { full_name: fullName || "" },
    email_confirm: true,
  });

  if (createError) {
    const msg = createError.message?.toLowerCase() || "";
    if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already exists")) {
      return res.status(400).json({ error: "An account with this email already exists. Please sign in instead." });
    }
    return res.status(400).json({ error: createError.message });
  }

  // Sign in to get a session
  const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return res.status(400).json({ error: signInError.message });

  return res.status(200).json({ session: data.session });
};
