/**
 * GET /api/download?token=xxx&fileId=yyy
 *
 * Returns a short-lived presigned GET URL.
 * After issuing the URL, the file is marked as storage_deleted in the DB
 * and queued for deletion from Wasabi — enforcing 1-download-then-delete.
 */

const { createClient } = require("@supabase/supabase-js");
const { S3Client, GetObjectCommand, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
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
      .select("id, file_name, file_url, file_size, expires_at, token, storage_deleted")
      .eq("token", token)
      .eq("id", fileId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "File not found" });
    }

    // Already downloaded and deleted from storage
    if (data.storage_deleted) {
      return res.status(410).json({
        error: "This file has already been downloaded and permanently deleted from our servers.",
        reason: "downloaded",
      });
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ error: "This share link has expired" });
    }

    // Generate presigned URL BEFORE marking as deleted
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: data.file_url,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(data.file_name)}`,
      ResponseCacheControl: "no-store",
    });
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 120 });

    // Fetch all files in the same share batch for batch deletion
    const { data: batchFiles } = await supabase
      .from("shares")
      .select("id, file_url")
      .eq("token", data.token);

    // Mark the ENTIRE batch as storage_deleted immediately
    // (prevents any subsequent download of any file in this batch)
    await supabase
      .from("shares")
      .update({ storage_deleted: true, storage_deleted_at: new Date().toISOString() })
      .eq("token", data.token);

    // Return the presigned URL to the client now
    res.status(200).json({ url: presignedUrl, fileName: data.file_name });

    // Delete all files in the batch from Wasabi in the background
    // (runs after response is sent — best-effort)
    setImmediate(async () => {
      try {
        if (!batchFiles?.length) return;
        const keys = batchFiles.map(f => ({ Key: f.file_url }));
        await s3.send(new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: keys, Quiet: true },
        }));
      } catch (err) {
        console.error("Auto-delete from Wasabi failed:", err);
      }
    });

  } catch (err) {
    console.error("download error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
