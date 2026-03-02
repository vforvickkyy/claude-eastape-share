/**
 * GET /api/download?token=xxx&fileId=yyy
 *
 * Returns a JSON object with a short-lived presigned GET URL.
 * The frontend then sets window.location.href = url to trigger a native
 * browser download — no blob fetching, no new tab, no CORS issues.
 *
 * Content-Disposition: attachment is baked into the presigned URL params
 * so Wasabi forces a download instead of opening in the browser.
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
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { token, fileId } = req.query;
  if (!token || !fileId) return res.status(400).json({ error: "token and fileId are required" });

  try {
    const { data, error } = await supabase
      .from("shares")
      .select("id, file_name, file_url, file_size, expires_at")
      .eq("token", token)
      .eq("id", fileId)
      .single();

    if (error || !data) {
      console.error("DB lookup failed:", error);
      return res.status(404).json({ error: "File not found" });
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ error: "This share link has expired" });
    }

    // Build presigned GET URL — attachment disposition forces download in browser
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: data.file_url,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(data.file_name)}`,
      ResponseCacheControl: "no-store",
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 120 });

    // Return JSON with the URL — frontend will do window.location.href = url
    // This avoids all CORS issues with fetch+blob approach and works for large files
    return res.status(200).json({ url: presignedUrl, fileName: data.file_name });
  } catch (err) {
    console.error("download error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
