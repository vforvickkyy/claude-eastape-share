/**
 * GET    /api/media/assets?projectId=&folderId=    — list assets
 * GET    /api/media/assets?id=                      — single asset
 * PUT    /api/media/assets?id=                      — update asset
 * DELETE /api/media/assets?id=                      — delete asset
 */
const { supabase, verifyAuth, cors } = require("./_auth");
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let user;
  try { user = await verifyAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { id, projectId, folderId } = req.query;

  // ── GET ──────────────────────────────────────────────────────────
  if (req.method === "GET") {
    if (id) {
      // Single asset with versions and comments count
      const { data, error } = await supabase
        .from("media_assets")
        .select("*, media_asset_versions(*), media_comments(count)")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (error) return res.status(404).json({ error: "Not found" });
      return res.json({ asset: data });
    }

    let q = supabase.from("media_assets").select("*").eq("user_id", user.id);
    if (projectId) q = q.eq("project_id", projectId);
    if (folderId === "null" || folderId === "root") q = q.is("folder_id", null);
    else if (folderId) q = q.eq("folder_id", folderId);

    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ assets: data });
  }

  // ── PUT — update ─────────────────────────────────────────────────
  if (req.method === "PUT") {
    if (!id) return res.status(400).json({ error: "id required" });
    const body = req.body || {};
    const updates = { updated_at: new Date().toISOString() };

    const ALLOWED = ["name", "status", "folder_id", "share_enabled", "bunny_video_status",
                     "bunny_playback_url", "bunny_thumbnail_url", "duration"];
    for (const key of ALLOWED) {
      if (key in body) updates[key] = body[key];
    }

    // Generate share_token on first enable
    if (body.share_enabled && !body.share_token) {
      const { data: existing } = await supabase.from("media_assets").select("share_token").eq("id", id).single();
      if (!existing?.share_token) updates.share_token = crypto.randomBytes(16).toString("hex");
    }

    // Version bump
    if (body.version_bump) {
      const { data: current } = await supabase.from("media_assets").select("version").eq("id", id).single();
      updates.version = (current?.version || 1) + 1;
    }

    const { data, error } = await supabase
      .from("media_assets")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ asset: data });
  }

  // ── DELETE ────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });

    // Optionally delete from Bunny Stream
    const { data: asset } = await supabase.from("media_assets").select("bunny_video_guid").eq("id", id).single();
    if (asset?.bunny_video_guid && process.env.BUNNY_STREAM_API_KEY && process.env.BUNNY_STREAM_LIBRARY_ID) {
      await fetch(
        `https://video.bunnycdn.com/library/${process.env.BUNNY_STREAM_LIBRARY_ID}/videos/${asset.bunny_video_guid}`,
        { method: "DELETE", headers: { AccessKey: process.env.BUNNY_STREAM_API_KEY } }
      ).catch(() => {});
    }

    const { error } = await supabase.from("media_assets").delete().eq("id", id).eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
