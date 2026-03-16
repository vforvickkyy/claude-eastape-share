/**
 * GET    /api/media/team?projectId=    — list team members
 * POST   /api/media/team               — invite member
 * PUT    /api/media/team?id=           — change role
 * DELETE /api/media/team?id=           — remove member
 */
const { supabase, verifyAuth, cors } = require("./_auth");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let user;
  try { user = await verifyAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { id, projectId } = req.query;

  // Verify requester owns the project (for mutating ops)
  async function assertOwner(pId) {
    const { data, error } = await supabase
      .from("media_projects")
      .select("id")
      .eq("id", pId)
      .eq("user_id", user.id)
      .single();
    if (error || !data) throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  if (req.method === "GET") {
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const { data, error } = await supabase
      .from("media_team_members")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at");
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ members: data });
  }

  if (req.method === "POST") {
    const { projectId: pId, email, role = "viewer" } = req.body || {};
    if (!pId || !email) return res.status(400).json({ error: "projectId and email required" });

    try { await assertOwner(pId); }
    catch (e) { return res.status(e.status || 403).json({ error: e.message }); }

    // Look up user by email
    const { data: users } = await supabase.auth.admin.listUsers();
    const invitee = users?.users?.find(u => u.email === email);

    const { data, error } = await supabase
      .from("media_team_members")
      .insert({
        project_id:    pId,
        user_id:       invitee?.id || null,
        invited_email: email,
        role,
        accepted:      !!invitee,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ member: data });
  }

  if (req.method === "PUT") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ error: "role required" });

    // Fetch member to get projectId for owner check
    const { data: member } = await supabase.from("media_team_members").select("project_id").eq("id", id).single();
    if (!member) return res.status(404).json({ error: "Member not found" });

    try { await assertOwner(member.project_id); }
    catch (e) { return res.status(e.status || 403).json({ error: e.message }); }

    const { data, error } = await supabase
      .from("media_team_members")
      .update({ role })
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ member: data });
  }

  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { data: member } = await supabase.from("media_team_members").select("project_id").eq("id", id).single();
    if (!member) return res.status(404).json({ error: "Member not found" });

    try { await assertOwner(member.project_id); }
    catch (e) { return res.status(e.status || 403).json({ error: e.message }); }

    const { error } = await supabase.from("media_team_members").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
