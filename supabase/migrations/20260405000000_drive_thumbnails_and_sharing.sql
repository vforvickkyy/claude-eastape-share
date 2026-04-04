-- Add thumbnail support to drive_files
ALTER TABLE drive_files ADD COLUMN IF NOT EXISTS thumbnail_key TEXT;

-- Add drive file/folder sharing to share_links
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS drive_file_id   UUID REFERENCES drive_files(id)   ON DELETE CASCADE;
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS drive_folder_id UUID REFERENCES drive_folders(id) ON DELETE CASCADE;
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS access_type     TEXT NOT NULL DEFAULT 'anyone';
