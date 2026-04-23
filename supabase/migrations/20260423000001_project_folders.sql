-- ── project_folders ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES project_folders(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Add folder_id column to project_files (if not already present)
ALTER TABLE project_files ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES project_folders(id) ON DELETE SET NULL;

-- Add folder_id column to project_media (if not already present)
ALTER TABLE project_media ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES project_folders(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_folders_project ON project_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_project_folders_parent  ON project_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_project_files_folder    ON project_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_project_media_folder    ON project_media(folder_id);

-- RLS
ALTER TABLE project_folders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_folders' AND policyname='project_folders_owner') THEN
    CREATE POLICY "project_folders_owner" ON project_folders FOR ALL USING (auth.uid() = user_id);
  END IF;
  -- Team members can also see folders for projects they belong to
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_folders' AND policyname='project_folders_member_read') THEN
    CREATE POLICY "project_folders_member_read" ON project_folders FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM project_members
        WHERE project_id = project_folders.project_id
          AND user_id = auth.uid()
          AND accepted = true
      )
    );
  END IF;
END $$;
