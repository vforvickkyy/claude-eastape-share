/**
 * GET /api/user/files
 * Returns the authenticated user's shares grouped by token.
 * Query params: folderId (optional), trash=true (optional), limit (optional)
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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { folderId, trash, limit = "100" } = req.query;
  const isTrash = trash === "true";

  // Fetch files
  let query = supabase
    .from("shares")
    .select("id, token, file_name, file_url, file_size, created_at, expires_at, folder_id, is_trashed, trashed_at")
    .eq("user_id", user.id)
    .eq("is_trashed", isTrash)
    .order("created_at", { ascending: false })
    .limit(parseInt(limit));

  if (!isTrash && folderId) {
    query = query.eq("folder_id", folderId);
  } else if (!isTrash && !folderId) {
    query = query.is("folder_id", null);
  }

  const { data: files, error: filesError } = await query;
  if (filesError) return res.status(500).json({ error: filesError.message });

  // Group files by token (each token = one upload batch / share)
  const shareMap = {};
  for (const file of files || []) {
    if (!shareMap[file.token]) {
      shareMap[file.token] = {
        token: file.token,
        created_at: file.created_at,
        expires_at: file.expires_at,
        folder_id: file.folder_id,
        is_trashed: file.is_trashed,
        trashed_at: file.trashed_at,
        files: [],
      };
    }
    shareMap[file.token].files.push({
      id: file.id,
      name: file.file_name,
      size: file.file_size,
      url: file.file_url,
    });
  }

  const shares = Object.values(shareMap);

  // Fetch folders for current level (not shown in trash)
  let folders = [];
  if (!isTrash) {
    const folderQuery = supabase
      .from("folders")
      .select("id, name, parent_id, created_at")
      .eq("user_id", user.id)
      .order("name");

    if (folderId) {
      folderQuery.eq("parent_id", folderId);
    } else {
      folderQuery.is("parent_id", null);
    }

    const { data: folderData } = await folderQuery;
    folders = folderData || [];
  }

  return res.status(200).json({ shares, folders });
};
