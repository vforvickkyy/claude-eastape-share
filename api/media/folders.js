/**
 * GET    /api/media/folders?projectId=&parentId=   — list folders
 * POST   /api/media/folders                         — create folder
 * PUT    /api/media/folders?id=                     — rename folder
 * DELETE /api/media/folders?id=                     — delete folder
 */
const { supabase, verifyAuth, cors } = require("./_auth");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let user;
  try { user = await verifyAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { id, projectId, parentId } = req.query;

  if (req.method === "GET") {
    let q = supabase.from("media_folders").select("*").eq("user_id", user.id);
    if (projectId) q = q.eq("project_id", projectId);
    if (parentId === "null" || parentId === "root") q = q.is("parent_folder_id", null);
    else if (parentId) q = q.eq("parent_folder_id", parentId);
    const { data, error } = await q.order("name");
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ folders: data });
  }

  if (req.method === "POST") {
    const { name, projectId: pId, parentFolderId } = req.body || {};
    if (!name || !pId) return res.status(400).json({ error: "name and projectId required" });

    const { data, error } = await supabase
      .from("media_folders")
      .insert({ name, project_id: pId, parent_folder_id: parentFolderId || null, user_id: user.id })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ folder: data });
  }

  if (req.method === "PUT") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { name } = req.body || {};
    const { data, error } = await supabase
      .from("media_folders")
      .update({ name })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ folder: data });
  }

  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase
      .from("media_folders")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
