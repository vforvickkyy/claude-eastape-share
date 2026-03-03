/**
 * GET  /api/user/profile  — return current user profile
 * PUT  /api/user/profile  — update name, company, avatar_url OR password
 *   Body: { action: "info", name, company, avatarUrl }
 *       | { action: "password", newPassword, confirmPassword }
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyUser(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

module.exports = async function handler(req, res) {
  const origin = process.env.FRONTEND_URL || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    return res.status(200).json({
      id:        user.id,
      email:     user.email,
      name:      user.user_metadata?.full_name || "",
      company:   user.user_metadata?.company   || "",
      avatarUrl: user.user_metadata?.avatar_url || null,
      createdAt: user.created_at,
    });
  }

  if (req.method === "PUT") {
    const { action } = req.body || {};

    // ── Update name / company / avatar ──────────────────
    if (action === "info") {
      const { name, company, avatarUrl } = req.body;
      const metadata = {
        ...user.user_metadata,
        full_name:  (name    ?? user.user_metadata?.full_name  ?? "").trim(),
        company:    (company ?? user.user_metadata?.company    ?? "").trim(),
      };
      if (avatarUrl !== undefined) metadata.avatar_url = avatarUrl;

      const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: metadata,
      });
      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({
        name:      data.user.user_metadata?.full_name || "",
        company:   data.user.user_metadata?.company   || "",
        avatarUrl: data.user.user_metadata?.avatar_url || null,
      });
    }

    // ── Change password ──────────────────────────────────
    if (action === "password") {
      const { newPassword, confirmPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match." });
      }
      const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action." });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
