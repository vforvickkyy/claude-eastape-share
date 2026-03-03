/**
 * PUT    /api/user/share/[token]  — trash, restore, or rename a share batch
 * DELETE /api/user/share/[token]  — permanently delete a share + its files from S3
 */
const { createClient } = require("@supabase/supabase-js");
const { S3Client, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const s3 = new S3Client({
  region: process.env.WASABI_REGION,
  endpoint: process.env.WASABI_ENDPOINT,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function verifyUser(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user || null;
}

module.exports = async function handler(req, res) {
  const origin = process.env.FRONTEND_URL || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token is required." });

  // Verify ownership
  const { data: rows, error: fetchError } = await supabase
    .from("shares")
    .select("id, file_url")
    .eq("token", token)
    .eq("user_id", user.id);

  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!rows || rows.length === 0) return res.status(404).json({ error: "Share not found." });

  if (req.method === "PUT") {
    const { action, folderId } = req.body || {};

    if (action === "trash") {
      const { error } = await supabase
        .from("shares")
        .update({ is_trashed: true, trashed_at: new Date().toISOString() })
        .eq("token", token)
        .eq("user_id", user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === "restore") {
      const { error } = await supabase
        .from("shares")
        .update({ is_trashed: false, trashed_at: null })
        .eq("token", token)
        .eq("user_id", user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === "move") {
      const { error } = await supabase
        .from("shares")
        .update({ folder_id: folderId || null })
        .eq("token", token)
        .eq("user_id", user.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action." });
  }

  if (req.method === "DELETE") {
    // Delete from S3
    const s3Keys = rows.map(r => ({ Key: r.file_url }));
    try {
      await s3.send(new DeleteObjectsCommand({
        Bucket: process.env.WASABI_BUCKET,
        Delete: { Objects: s3Keys },
      }));
    } catch (s3Err) {
      console.error("S3 delete error:", s3Err);
      // Continue with DB delete even if S3 fails
    }

    const { error } = await supabase
      .from("shares")
      .delete()
      .eq("token", token)
      .eq("user_id", user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
