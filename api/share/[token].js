/**
 * GET /api/share/:token
 *
 * Returns metadata for all files in a share.
 * Does NOT return download URLs — those are fetched per-file via /api/download
 *
 * Response: {
 *   token: string,
 *   files: [{ id, file_name, file_size, created_at }],
 *   expires_at: string,
 * }
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token } = req.query;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token required" });
  }

  try {
    const { data, error } = await supabase
      .from("shares")
      .select("id, file_name, file_size, created_at, expires_at")
      .eq("token", token)
      .order("id", { ascending: true });

    if (error) {
      console.error("Supabase fetch error:", error);
      return res.status(500).json({ error: "Database error" });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Share not found or expired" });
    }

    // Check expiry (server-side guard)
    const expired = data[0].expires_at && new Date(data[0].expires_at) < new Date();
    if (expired) {
      return res.status(410).json({ error: "This share link has expired" });
    }

    return res.status(200).json({
      token,
      expires_at: data[0].expires_at,
      files: data.map((row) => ({
        id: row.id,
        file_name: row.file_name,
        file_size: row.file_size,
        created_at: row.created_at,
      })),
    });
  } catch (err) {
    console.error("share/[token] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
