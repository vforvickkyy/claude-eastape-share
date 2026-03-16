/**
 * GET /api/media/share/:token[?password=]
 *
 * Public endpoint — no auth required.
 * Resolves a share link and returns asset/folder/project data.
 * Increments view_count.
 */
const { supabase, cors } = require("../_auth");

module.exports = async function handler(req, res) {
  cors(res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")     return res.status(405).json({ error: "Method not allowed" });

  const { token, password } = req.query;
  if (!token) return res.status(400).json({ error: "token required" });

  // Fetch link (use service role to bypass RLS for public access)
  const { data: link, error } = await supabase
    .from("media_share_links")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !link) return res.status(404).json({ error: "Share link not found" });

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return res.status(410).json({ error: "This share link has expired" });
  }

  // Check password
  if (link.password) {
    if (!password) return res.status(401).json({ error: "Password required", passwordRequired: true });
    if (password !== link.password) return res.status(403).json({ error: "Incorrect password" });
  }

  // Increment view count (fire-and-forget)
  supabase.from("media_share_links")
    .update({ view_count: (link.view_count || 0) + 1 })
    .eq("token", token)
    .then(() => {})
    .catch(() => {});

  // Fetch the linked resource
  const payload = {
    allowDownload: link.allow_download,
    allowComments: link.allow_comments,
    expiresAt:     link.expires_at,
  };

  if (link.asset_id) {
    const { data: asset } = await supabase
      .from("media_assets")
      .select("id, name, type, bunny_video_guid, bunny_video_status, bunny_playback_url, bunny_thumbnail_url, duration, file_size, status, mime_type, created_at")
      .eq("id", link.asset_id)
      .single();

    if (!asset) return res.status(404).json({ error: "Asset not found" });

    let comments = [];
    if (link.allow_comments) {
      const { data: c } = await supabase
        .from("media_comments")
        .select("*")
        .eq("asset_id", link.asset_id)
        .order("created_at");
      comments = c || [];
    }

    return res.json({ ...payload, type: "asset", asset, comments });
  }

  if (link.folder_id) {
    const { data: folder } = await supabase
      .from("media_folders")
      .select("id, name, project_id, created_at")
      .eq("id", link.folder_id)
      .single();

    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, name, type, bunny_thumbnail_url, duration, status, created_at")
      .eq("folder_id", link.folder_id);

    return res.json({ ...payload, type: "folder", folder, assets: assets || [] });
  }

  if (link.project_id) {
    const { data: project } = await supabase
      .from("media_projects")
      .select("id, name, description, color, created_at")
      .eq("id", link.project_id)
      .single();

    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, name, type, bunny_thumbnail_url, duration, status, created_at")
      .eq("project_id", link.project_id);

    return res.json({ ...payload, type: "project", project, assets: assets || [] });
  }

  return res.status(500).json({ error: "Share link has no target" });
};
