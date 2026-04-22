-- Add short_token to share_links for human-readable URLs
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS short_token TEXT UNIQUE;

-- Backfill existing rows with first 8 hex chars of their UUID (no dashes)
UPDATE share_links
SET short_token = lower(substr(replace(id::text, '-', ''), 1, 8))
WHERE short_token IS NULL;
