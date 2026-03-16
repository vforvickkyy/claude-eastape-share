/**
 * POST /api/media/upload-init
 * Body: { projectId, folderId?, name, size, mimeType, type? }
 *
 * 1. Creates a Bunny Stream video object → gets guid
 * 2. Builds TUS upload URL + signed headers for the client
 * 3. Inserts a pending media_assets record
 * 4. Returns { uploadUrl, tusHeaders, assetId, guid }
 */
const { supabase, verifyAuth, cors } = require("./_auth");
const crypto = require("crypto");

const BUNNY_API_KEY    = process.env.BUNNY_STREAM_API_KEY;
const BUNNY_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;
const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

module.exports = async function handler(req, res) {
  cors(res, "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let user;
  try { user = await verifyAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { projectId, folderId, name, size, mimeType, type = "video" } = req.body || {};
  if (!projectId || !name || !size) {
    return res.status(400).json({ error: "projectId, name, and size are required" });
  }

  let uploadUrl  = null;
  let tusHeaders = null;
  let guid       = null;

  // ── 1. Bunny Stream: create video object + build TUS headers ──
  if (BUNNY_API_KEY && BUNNY_LIBRARY_ID && type === "video") {

    // Create video object in Bunny library
    const createRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
      {
        method:  "POST",
        headers: {
          AccessKey:      BUNNY_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: name }),
      }
    );

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      console.error("Bunny Stream create error:", createRes.status, errText);
      return res.status(502).json({ error: "Failed to create video in Bunny Stream" });
    }

    const videoObj = await createRes.json();
    guid = videoObj.guid;

    // Build TUS signature
    // Signature = SHA256( libraryId + apiKey + expirationTime + videoGuid )
    const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const signature = crypto
      .createHash("sha256")
      .update(BUNNY_LIBRARY_ID + BUNNY_API_KEY + expirationTime + guid)
      .digest("hex");

    uploadUrl  = BUNNY_TUS_ENDPOINT;
    tusHeaders = {
      AuthorizationSignature: signature,
      AuthorizationExpire:    String(expirationTime),
      VideoId:                guid,
      LibraryId:              BUNNY_LIBRARY_ID,
    };
  }

  // ── 2. Insert pending asset in DB ─────────────────────────────
  const { data: asset, error } = await supabase
    .from("media_assets")
    .insert({
      project_id:        projectId,
      folder_id:         folderId || null,
      user_id:           user.id,
      name,
      type,
      mime_type:         mimeType || null,
      file_size:         size,
      bunny_video_guid:  guid,
      bunny_video_status: guid ? "uploading" : "ready",
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ uploadUrl, tusHeaders, assetId: asset.id, guid });
};
