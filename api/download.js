/**
 * GET /api/download?token=xxx&fileId=yyy
 *
 * Generates a short-lived (60s) presigned GET URL for a specific file.
 * The browser is redirected to that URL — the file downloads directly from
 * Wasabi with Content-Disposition: attachment (forced download, no preview).
 *
 * No file bytes pass through this server.
 */

const { createClient } = require("@supabase/supabase-js");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

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

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, fileId } = req.query;

  if (!token || !fileId) {
    return res.status(400).json({ error: "token and fileId are required" });
  }

  try {
    // Fetch the row — validate token + fileId match (security: can't guess other tokens)
    const { data, error } = await supabase
      .from("shares")
      .select("id, file_name, file_url, file_size, expires_at")
      .eq("token", token)
      .eq("id", fileId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "File not found" });
    }

    // Expiry check
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ error: "This share link has expired" });
    }

    // Generate a short-lived presigned GET URL with forced download headers
    // Content-Disposition: attachment ensures browser downloads, not opens
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: data.file_url,                           // stored S3 key
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(data.file_name)}"`,
      ResponseCacheControl: "no-store",
    });

    const presignedUrl = await getSignedUrl(s3, command, {
      expiresIn: 60, // 60 seconds — enough time for the browser to start the download
    });

    // Redirect browser directly to Wasabi — zero bytes stream through Vercel
    res.setHeader("Location", presignedUrl);
    return res.status(302).end();
  } catch (err) {
    console.error("download error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
