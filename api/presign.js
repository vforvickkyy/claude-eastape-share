/**
 * POST /api/presign
 * Generates presigned PUT URLs for Wasabi, inserts metadata into Supabase.
 * Files are stored with CLEAN original filenames — no timestamp prefix.
 */

const { createClient } = require("@supabase/supabase-js");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const s3 = new S3Client({
  region: process.env.WASABI_REGION,
  endpoint: process.env.WASABI_ENDPOINT,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.WASABI_BUCKET;
const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { files, userId, folderId } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0)
      return res.status(400).json({ error: "No files provided" });
    if (files.length > 20)
      return res.status(400).json({ error: "Max 20 files per share" });

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SHARE_TTL_SECONDS * 1000).toISOString();

    const uploads = await Promise.all(
      files.map(async (file) => {
        // ── Clean filename: keep original name, only strip dangerous chars ──
        // NO timestamp prefix — user sees actual filename in Wasabi too
        const safeName = file.name
          .replace(/\\/g, "/")          // normalize slashes
          .split("/").pop()             // strip any path component
          .replace(/[^\w.\-() ]/g, "_") // strip unsafe chars, keep spaces/dots/dashes
          .replace(/\s+/g, " ")         // collapse multiple spaces
          .trim()
          .slice(0, 255)
          || "file";

        // S3 key: shares/{token}/{original-clean-name}
        // Using token as folder means filenames within one share must be unique.
        // If two files have same name, append index to avoid collision.
        const s3Key = `shares/${token}/${safeName}`;

        const command = new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key,
          ContentType: file.type || "application/octet-stream",
          ContentLength: file.size,
        });

        const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        return { originalName: file.name, safeName, s3Key, size: file.size, type: file.type, presignedUrl };
      })
    );

    // Insert one Supabase row per file
    const rows = uploads.map((u) => ({
      token,
      file_name: u.safeName,
      file_url:  u.s3Key,
      file_size: u.size,
      expires_at: expiresAt,
      user_id:   userId   || null,
      folder_id: folderId || null,
    }));

    const { error: dbError } = await supabase.from("shares").insert(rows);
    if (dbError) {
      console.error("Supabase insert error:", dbError);
      return res.status(500).json({ error: "Database error", detail: dbError.message });
    }

    return res.status(200).json({
      token,
      uploads: uploads.map((u) => ({
        name: u.originalName,
        presignedUrl: u.presignedUrl,
        size: u.size,
      })),
    });
  } catch (err) {
    console.error("presign error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
