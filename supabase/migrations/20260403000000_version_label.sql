-- Add label column to project_media_versions for custom version names
ALTER TABLE project_media_versions ADD COLUMN IF NOT EXISTS label TEXT;
