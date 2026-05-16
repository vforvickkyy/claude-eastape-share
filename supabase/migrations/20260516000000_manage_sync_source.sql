-- ── Auto-sync: link production scenes/shots to project folders/media ─────────

-- Scenes can originate from a project folder (auto-created when folder is made)
ALTER TABLE production_scenes
  ADD COLUMN IF NOT EXISTS source_folder_id uuid REFERENCES project_folders(id) ON DELETE SET NULL;

-- Shots can originate from a project media file (auto-created on upload)
ALTER TABLE production_shots
  ADD COLUMN IF NOT EXISTS source_media_id uuid REFERENCES project_media(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_scenes_source_folder
  ON production_scenes(source_folder_id) WHERE source_folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_production_shots_source_media
  ON production_shots(source_media_id) WHERE source_media_id IS NOT NULL;
