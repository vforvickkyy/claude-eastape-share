/**
 * GET /api/media/upload-status?assetId=
 *
 * Polls Bunny Stream for video processing status.
 * Bunny status codes:
 *   0 = Created, 1 = Uploaded, 2 = Processing,
 *   3 = Transcoding, 4 = Finished, 5 = Error
 * Maps to internal: 0-3 → 'uploading' | 4 → 'ready' | 5 → 'error'
 *
 * When ready, saves thumbnail + playback URLs and duration to DB.
 * Returns { status, thumbnailUrl, playbackUrl, duration, assetId }
 */
const { supabase, verifyAuth, cors } = require("./_auth");

const BUNNY_API_KEY    = process.env.BUNNY_STREAM_API_KEY;
const BUNNY_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;
const BUNNY_CDN_HOST   = process.env.BUNNY_STREAM_CDN_HOSTNAME;

module.exports = async function handler(req, res) {
  cors(res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")     return res.status(405).json({ error: "Method not allowed" });

  let user;
  try { user = await verifyAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }

  const { assetId } = req.query;
  if (!assetId) return res.status(400).json({ error: "assetId required" });

  const { data: asset, error: dbErr } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", assetId)
    .eq("user_id", user.id)
    .single();

  if (dbErr || !asset) return res.status(404).json({ error: "Asset not found" });

  // Already ready — return cached values
  if (asset.bunny_video_status === "ready") {
    return res.json({
      status:       "ready",
      thumbnailUrl: asset.bunny_thumbnail_url,
      playbackUrl:  asset.bunny_playback_url,
      assetId,
    });
  }

  // No guid or missing credentials — return current status
  if (!asset.bunny_video_guid || !BUNNY_API_KEY || !BUNNY_LIBRARY_ID) {
    return res.json({ status: asset.bunny_video_status || "uploading", assetId });
  }

  // ── Poll Bunny Stream ──────────────────────────────────────────
  const bunnyRes = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${asset.bunny_video_guid}`,
    { headers: { AccessKey: BUNNY_API_KEY } }
  );

  if (!bunnyRes.ok) return res.json({ status: "uploading", assetId });

  const video = await bunnyRes.json();

  // Bunny status: 4 = Finished
  if (video.status === 4) {
    const cdnHost      = BUNNY_CDN_HOST || "iframe.mediadelivery.net";
    const thumbnailUrl = `https://${cdnHost}/${asset.bunny_video_guid}/thumbnail.jpg`;
    const playbackUrl  = `https://${cdnHost}/${asset.bunny_video_guid}/play`;
    const duration     = video.length || null; // Bunny returns duration in seconds as `length`

    await supabase.from("media_assets").update({
      bunny_video_status: "ready",
      bunny_thumbnail_url: thumbnailUrl,
      bunny_playback_url:  playbackUrl,
      duration,
      updated_at: new Date().toISOString(),
    }).eq("id", assetId);

    return res.json({ status: "ready", thumbnailUrl, playbackUrl, duration, assetId });
  }

  // Bunny status: 5 = Error
  if (video.status === 5) {
    await supabase.from("media_assets")
      .update({ bunny_video_status: "error" })
      .eq("id", assetId);
    return res.json({ status: "error", assetId });
  }

  // Still processing (0-3)
  return res.json({ status: "uploading", assetId });
};
