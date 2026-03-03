/**
 * POST /api/user/avatar
 * Accepts a base64-encoded image, uploads it to Supabase Storage (avatars bucket),
 * and returns the public URL.
 * Body: { base64: "data:image/jpeg;base64,...", extension: "jpg" }
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
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // ── DELETE: remove avatar ─────────────────────────────
  if (req.method === "DELETE") {
    // Remove all files for this user in the avatars bucket
    const { data: list } = await supabase.storage.from("avatars").list(user.id);
    if (list?.length) {
      const paths = list.map(f => `${user.id}/${f.name}`);
      await supabase.storage.from("avatars").remove(paths);
    }
    // Clear avatar_url from metadata
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, avatar_url: null },
    });
    return res.status(200).json({ ok: true });
  }

  // ── POST: upload new avatar ───────────────────────────
  if (req.method === "POST") {
    const { base64, extension = "jpg" } = req.body || {};
    if (!base64) return res.status(400).json({ error: "No image data provided." });

    // Strip data URL prefix if present
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Limit: 2MB
    if (buffer.byteLength > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "Image must be under 2MB." });
    }

    const ext = ["jpg", "jpeg", "png", "webp", "gif"].includes(extension.toLowerCase())
      ? extension.toLowerCase()
      : "jpg";
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "png"  ? "image/png"
      : ext === "webp" ? "image/webp"
      : "image/gif";

    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: { publicUrl } } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    // Store avatar_url in user metadata
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, avatar_url: publicUrl },
    });

    return res.status(200).json({ avatarUrl: publicUrl });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
