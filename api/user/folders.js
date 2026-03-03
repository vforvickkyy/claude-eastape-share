/**
 * GET  /api/user/folders  — list folders (optionally by parentId)
 * POST /api/user/folders  — create a new folder
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const { parentId } = req.query;
    let query = supabase
      .from("folders")
      .select("id, name, parent_id, created_at")
      .eq("user_id", user.id)
      .order("name");

    if (parentId) {
      query = query.eq("parent_id", parentId);
    } else {
      query = query.is("parent_id", null);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ folders: data || [] });
  }

  if (req.method === "POST") {
    const { name, parentId } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "Folder name is required." });

    const { data, error } = await supabase
      .from("folders")
      .insert({ user_id: user.id, name: name.trim(), parent_id: parentId || null })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ folder: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
