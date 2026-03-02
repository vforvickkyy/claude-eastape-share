/**
 * POST /api/presign
 *
 * Body: { files: [{ name: string, size: number, type: string }] }
 *
 * Returns: { token: string, uploads: [{ name, presignedUrl, s3Key }] }
 *
 * Flow:
 *  1. Generate a unique share token
 *  2. For each file, generate a Wasabi S3 presigned PUT URL
 *  3. Insert the share record + per-file records into Supabase
 *  4. Return the presigned URLs to the client so it can PUT directly to Wasabi
 *
 * No file bytes ever touch this server — the browser uploads directly to Wasabi.
 */

const { createClient } = require("@supabase/supabase-js");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");

// ── Supabase client (service role for trusted server-side writes) ──────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Wasabi S3 client ────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.WASABI_REGION,          // e.g. "us-east-1"
  endpoint: process.env.WASABI_ENDPOINT,      // e.g. "https://s3.us-east-1.wasabisys.com"
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,                       // required for Wasabi
});

const BUCKET = process.env.WASABI_BUCKET;
const EXPIRES_SECONDS = 7 * 24 * 60 * 60;    // 7 days presigned URL TTL

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    if (files.length > 20) {
      return res.status(400).json({ error: "Max 20 files per share" });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + EXPIRES_SECONDS * 1000).toISOString();

    // ── Build per-file S3 keys and presigned PUT URLs ──────────────────────
    const uploads = await Promise.all(
      files.map(async (file) => {
        // Sanitise file name — strip path traversal, keep extension
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_() ]/g, "_").slice(0, 255);
        const s3Key = `shares/${token}/${Date.now()}-${safeName}`;

        const command = new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key,
          ContentType: file.type || "application/octet-stream",
          ContentLength: file.size,
        });

        const presignedUrl = await getSignedUrl(s3, command, {
          expiresIn: 3600, // client must PUT within 1 hour
        });

        return {
          name: safeName,
          originalName: file.name,
          size: file.size,
          type: file.type,
          s3Key,
          presignedUrl,
        };
      })
    );

    // ── Insert into Supabase (one row per file) ────────────────────────────
    // The shares table stores one row per FILE (matches your schema with file_name/file_url etc.)
    const rows = uploads.map((u) => ({
      token,
      file_name: u.name,
      file_url: u.s3Key,          // we store the S3 key; download API resolves it later
      file_size: u.size,
      expires_at: expiresAt,
    }));

    const { error: dbError } = await supabase.from("shares").insert(rows);
    if (dbError) {
      console.error("Supabase insert error:", dbError);
      return res.status(500).json({ error: "Database error", detail: dbError.message });
    }

    // Return token + presigned PUT URLs (never expose S3 keys to client)
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
