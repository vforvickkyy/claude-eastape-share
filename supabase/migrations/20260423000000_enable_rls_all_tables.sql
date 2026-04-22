-- ═══════════════════════════════════════════════════════════════════
-- Enable RLS on all public tables and add owner policies
-- Edge functions use service_role key which bypasses RLS,
-- so these policies protect against direct DB/anon access only.
-- ═══════════════════════════════════════════════════════════════════

-- ── profiles ─────────────────────────────────────────────────────
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_owner') THEN
    CREATE POLICY "profiles_owner" ON profiles FOR ALL USING (auth.uid() = id);
  END IF;
  -- Allow users to read other profiles (needed for team/member lookups)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_read') THEN
    CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (true);
  END IF;
END $$;

-- ── plans ─────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS plans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plans' AND policyname='plans_public_read') THEN
    CREATE POLICY "plans_public_read" ON plans FOR SELECT USING (true);
  END IF;
END $$;

-- ── user_plans ────────────────────────────────────────────────────
ALTER TABLE IF EXISTS user_plans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_plans' AND policyname='user_plans_owner') THEN
    CREATE POLICY "user_plans_owner" ON user_plans FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── projects ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS projects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='projects_owner') THEN
    CREATE POLICY "projects_owner" ON projects FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── project_files ─────────────────────────────────────────────────
ALTER TABLE IF EXISTS project_files ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_files' AND policyname='project_files_owner') THEN
    CREATE POLICY "project_files_owner" ON project_files FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── project_media ─────────────────────────────────────────────────
ALTER TABLE IF EXISTS project_media ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_media' AND policyname='project_media_owner') THEN
    CREATE POLICY "project_media_owner" ON project_media FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── project_folders ───────────────────────────────────────────────
ALTER TABLE IF EXISTS project_folders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_folders' AND policyname='project_folders_owner') THEN
    CREATE POLICY "project_folders_owner" ON project_folders FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── project_members ───────────────────────────────────────────────
ALTER TABLE IF EXISTS project_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_members' AND policyname='project_members_owner') THEN
    CREATE POLICY "project_members_owner" ON project_members FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = project_id AND user_id = auth.uid())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_members' AND policyname='project_members_self') THEN
    CREATE POLICY "project_members_self" ON project_members FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── project_activity ──────────────────────────────────────────────
ALTER TABLE IF EXISTS project_activity ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_activity' AND policyname='project_activity_owner') THEN
    CREATE POLICY "project_activity_owner" ON project_activity FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── drive_files ───────────────────────────────────────────────────
ALTER TABLE IF EXISTS drive_files ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='drive_files' AND policyname='drive_files_owner') THEN
    CREATE POLICY "drive_files_owner" ON drive_files FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── drive_folders ─────────────────────────────────────────────────
ALTER TABLE IF EXISTS drive_folders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='drive_folders' AND policyname='drive_folders_owner') THEN
    CREATE POLICY "drive_folders_owner" ON drive_folders FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── share_links ───────────────────────────────────────────────────
ALTER TABLE IF EXISTS share_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='share_links' AND policyname='share_links_owner') THEN
    CREATE POLICY "share_links_owner" ON share_links FOR ALL USING (auth.uid() = created_by);
  END IF;
  -- Public can read share links (for the /share/:token page which uses service role anyway)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='share_links' AND policyname='share_links_public_read') THEN
    CREATE POLICY "share_links_public_read" ON share_links FOR SELECT USING (true);
  END IF;
END $$;

-- ── pipeline_cells (if exists) ────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pipeline_cells') THEN
    EXECUTE 'ALTER TABLE pipeline_cells ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pipeline_cells' AND policyname='pipeline_cells_owner') THEN
      EXECUTE 'CREATE POLICY "pipeline_cells_owner" ON pipeline_cells FOR ALL USING (EXISTS (SELECT 1 FROM projects WHERE id = project_id AND user_id = auth.uid()))';
    END IF;
  END IF;
END $$;

-- ── pipeline_columns (if exists) ──────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pipeline_columns') THEN
    EXECUTE 'ALTER TABLE pipeline_columns ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pipeline_columns' AND policyname='pipeline_columns_owner') THEN
      EXECUTE 'CREATE POLICY "pipeline_columns_owner" ON pipeline_columns FOR ALL USING (EXISTS (SELECT 1 FROM projects WHERE id = project_id AND user_id = auth.uid()))';
    END IF;
  END IF;
END $$;
