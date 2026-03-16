-- ═══════════════════════════════════════════════════════════════
-- Rename Cloudflare Stream columns → Bunny Stream
-- Run via: supabase db push  OR paste into Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════

-- ── media_assets ──────────────────────────────────────────────
ALTER TABLE media_assets
  RENAME COLUMN cloudflare_stream_uid    TO bunny_video_guid;

ALTER TABLE media_assets
  RENAME COLUMN cloudflare_stream_status TO bunny_video_status;

ALTER TABLE media_assets
  RENAME COLUMN cloudflare_playback_url  TO bunny_playback_url;

ALTER TABLE media_assets
  RENAME COLUMN cloudflare_thumbnail_url TO bunny_thumbnail_url;

-- ── media_asset_versions ──────────────────────────────────────
ALTER TABLE media_asset_versions
  RENAME COLUMN cloudflare_stream_uid    TO bunny_video_guid;

ALTER TABLE media_asset_versions
  RENAME COLUMN cloudflare_playback_url  TO bunny_playback_url;

ALTER TABLE media_asset_versions
  RENAME COLUMN cloudflare_thumbnail_url TO bunny_thumbnail_url;
