-- ═══════════════════════════════════════════════════════════════
-- Eastape Media Schema
-- Run via: supabase db push  OR paste into Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════

-- ── media_projects ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  color        TEXT DEFAULT '#7c3aed',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE media_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_projects" ON media_projects FOR ALL USING (auth.uid() = user_id);

-- Team members can also read projects they belong to
CREATE POLICY "team_read_projects" ON media_projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM media_team_members WHERE project_id = id AND user_id = auth.uid() AND accepted = true)
);

-- ── media_folders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_folders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
  parent_folder_id UUID REFERENCES media_folders(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE media_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_folders" ON media_folders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "team_read_folders" ON media_folders FOR SELECT USING (
  EXISTS (SELECT 1 FROM media_team_members WHERE project_id = media_folders.project_id AND user_id = auth.uid() AND accepted = true)
);

-- ── media_assets ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_assets (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                UUID NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
  folder_id                 UUID REFERENCES media_folders(id) ON DELETE SET NULL,
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  type                      TEXT NOT NULL DEFAULT 'video',
  cloudflare_stream_uid     TEXT,
  cloudflare_stream_status  TEXT DEFAULT 'uploading',
  cloudflare_playback_url   TEXT,
  cloudflare_thumbnail_url  TEXT,
  duration                  FLOAT,
  file_size                 BIGINT,
  mime_type                 TEXT,
  status                    TEXT DEFAULT 'in_review',
  version                   INT DEFAULT 1,
  share_token               TEXT UNIQUE,
  share_enabled             BOOLEAN DEFAULT false,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_assets" ON media_assets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "team_read_assets" ON media_assets FOR SELECT USING (
  EXISTS (SELECT 1 FROM media_team_members WHERE project_id = media_assets.project_id AND user_id = auth.uid() AND accepted = true)
);

-- ── media_asset_versions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_asset_versions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                 UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  version_number           INT NOT NULL,
  cloudflare_stream_uid    TEXT,
  cloudflare_playback_url  TEXT,
  cloudflare_thumbnail_url TEXT,
  uploaded_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE media_asset_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_versions" ON media_asset_versions FOR ALL USING (
  EXISTS (SELECT 1 FROM media_assets WHERE id = asset_id AND user_id = auth.uid())
);

-- ── media_comments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_comment_id UUID REFERENCES media_comments(id) ON DELETE CASCADE,
  timestamp_seconds FLOAT,
  body              TEXT NOT NULL,
  resolved          BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE media_comments ENABLE ROW LEVEL SECURITY;
-- Asset owner can manage all comments on their assets
CREATE POLICY "asset_owner_all_comments" ON media_comments FOR ALL USING (
  EXISTS (SELECT 1 FROM media_assets WHERE id = asset_id AND user_id = auth.uid())
);
-- Comment author can manage own comments
CREATE POLICY "comment_author_all" ON media_comments FOR ALL USING (auth.uid() = user_id);
-- Team members can read comments
CREATE POLICY "team_read_comments" ON media_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM media_assets a
    JOIN media_team_members tm ON tm.project_id = a.project_id
    WHERE a.id = asset_id AND tm.user_id = auth.uid() AND tm.accepted = true
  )
);

-- ── media_share_links ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_share_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         UUID REFERENCES media_assets(id) ON DELETE CASCADE,
  folder_id        UUID REFERENCES media_folders(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES media_projects(id) ON DELETE CASCADE,
  token            TEXT UNIQUE NOT NULL,
  created_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password         TEXT,
  expires_at       TIMESTAMPTZ,
  allow_download   BOOLEAN DEFAULT true,
  allow_comments   BOOLEAN DEFAULT false,
  view_count       INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE media_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_share_links" ON media_share_links FOR ALL USING (auth.uid() = created_by);
-- Public read is handled via service role in the public API endpoint

-- ── media_team_members ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_team_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'viewer',
  invited_email  TEXT,
  accepted       BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE media_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_owner_all_team" ON media_team_members FOR ALL USING (
  EXISTS (SELECT 1 FROM media_projects WHERE id = project_id AND user_id = auth.uid())
);
CREATE POLICY "member_read_own" ON media_team_members FOR SELECT USING (auth.uid() = user_id);

-- ── Indexes for performance ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_media_assets_project ON media_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_folder  ON media_assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_user    ON media_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_media_comments_asset ON media_comments(asset_id);
CREATE INDEX IF NOT EXISTS idx_media_folders_project ON media_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_media_team_project   ON media_team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_media_team_user      ON media_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_share_token          ON media_share_links(token);
CREATE INDEX IF NOT EXISTS idx_asset_share_token    ON media_assets(share_token);
