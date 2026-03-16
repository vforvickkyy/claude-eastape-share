/**
 * GET    /api/media/projects          — list all user projects
 * POST   /api/media/projects          — create project
 * PUT    /api/media/projects?id=      — update project
 * DELETE /api/media/projects?id=      — delete project
 */
const { supabase, verifyAuth, cors } = require("./_auth");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let user;
  try { user = await verifyAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { id } = req.query;

  // ── GET ──────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("media_projects")
      .select("*, media_assets(count), media_team_members(count)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ projects: data });
  }

  // ── POST — create ────────────────────────────────────────────────
  if (req.method === "POST") {
    const { name, description, color } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const { data, error } = await supabase
      .from("media_projects")
      .insert({ name, description, color: color || "#7c3aed", user_id: user.id })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ project: data });
  }

  // ── PUT — update ─────────────────────────────────────────────────
  if (req.method === "PUT") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { name, description, color } = req.body || {};
    const updates = {};
    if (name)        updates.name        = name;
    if (description !== undefined) updates.description = description;
    if (color)       updates.color       = color;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("media_projects")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ project: data });
  }

  // ── DELETE ────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase
      .from("media_projects")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
