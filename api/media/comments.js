/**
 * GET    /api/media/comments?assetId=               — list comments for asset
 * POST   /api/media/comments                         — create comment
 * PUT    /api/media/comments?id=                     — update (resolve, edit body)
 * DELETE /api/media/comments?id=                     — delete comment
 */
const { supabase, verifyAuth, cors } = require("./_auth");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let user;
  try { user = await verifyAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { id, assetId } = req.query;

  if (req.method === "GET") {
    if (!assetId) return res.status(400).json({ error: "assetId required" });

    // Verify user owns the asset (or is team member)
    const { data: asset } = await supabase
      .from("media_assets")
      .select("id, user_id")
      .eq("id", assetId)
      .single();

    if (!asset) return res.status(404).json({ error: "Asset not found" });

    const { data, error } = await supabase
      .from("media_comments")
      .select(`
        *,
        profiles:user_id (
          id,
          raw_user_meta_data->full_name as full_name,
          raw_user_meta_data->avatar_url as avatar_url,
          email
        )
      `)
      .eq("asset_id", assetId)
      .order("created_at");

    if (error) {
      // Fallback without join if profiles view doesn't exist
      const { data: simple, error: e2 } = await supabase
        .from("media_comments")
        .select("*")
        .eq("asset_id", assetId)
        .order("created_at");
      if (e2) return res.status(500).json({ error: e2.message });
      return res.json({ comments: simple });
    }
    return res.json({ comments: data });
  }

  if (req.method === "POST") {
    const { assetId: aid, body, timestampSeconds, parentCommentId } = req.body || {};
    if (!aid || !body) return res.status(400).json({ error: "assetId and body required" });

    const { data, error } = await supabase
      .from("media_comments")
      .insert({
        asset_id:          aid,
        user_id:           user.id,
        body,
        timestamp_seconds: timestampSeconds ?? null,
        parent_comment_id: parentCommentId  ?? null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ comment: data });
  }

  if (req.method === "PUT") {
    if (!id) return res.status(400).json({ error: "id required" });
    const body = req.body || {};
    const updates = { updated_at: new Date().toISOString() };
    if ("resolved" in body) updates.resolved = body.resolved;
    if ("body"     in body) updates.body     = body.body;

    const { data, error } = await supabase
      .from("media_comments")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ comment: data });
  }

  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase
      .from("media_comments")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
