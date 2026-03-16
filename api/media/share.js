/**
 * POST   /api/media/share               — generate share link
 * DELETE /api/media/share?id=           — revoke share link
 * GET    /api/media/share?assetId=      — list share links for asset
 */
const { supabase, verifyAuth, cors } = require("./_auth");
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let user;
  try { user = await verifyAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { id, assetId } = req.query;

  if (req.method === "GET") {
    if (!assetId) return res.status(400).json({ error: "assetId required" });
    const { data, error } = await supabase
      .from("media_share_links")
      .select("*")
      .eq("asset_id", assetId)
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ links: data });
  }

  if (req.method === "POST") {
    const { assetId: aid, folderId, projectId, password, expiresAt,
            allowDownload = true, allowComments = false } = req.body || {};

    if (!aid && !folderId && !projectId) {
      return res.status(400).json({ error: "assetId, folderId, or projectId required" });
    }

    const token = crypto.randomBytes(20).toString("hex");

    const { data, error } = await supabase
      .from("media_share_links")
      .insert({
        asset_id:       aid     || null,
        folder_id:      folderId  || null,
        project_id:     projectId || null,
        token,
        created_by:     user.id,
        password:       password  || null,
        expires_at:     expiresAt || null,
        allow_download: allowDownload,
        allow_comments: allowComments,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const shareUrl = `${process.env.FRONTEND_URL || ""}/media/share/${token}`;
    return res.status(201).json({ link: data, shareUrl });
  }

  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase
      .from("media_share_links")
      .delete()
      .eq("id", id)
      .eq("created_by", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
