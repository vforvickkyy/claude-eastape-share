-- Add cell_type and status_options to pipeline_stages
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS cell_type text DEFAULT 'checkbox',
  ADD COLUMN IF NOT EXISTS status_options jsonb DEFAULT '[]';

-- Update any existing stages with NULL cell_type
UPDATE pipeline_stages SET cell_type = 'checkbox'
WHERE cell_type IS NULL OR cell_type = '';

-- Add custom_assignee to production_shots
ALTER TABLE production_shots
  ADD COLUMN IF NOT EXISTS custom_assignee text DEFAULT NULL;

-- Create project_custom_assignees table
CREATE TABLE IF NOT EXISTS project_custom_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_custom_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access" ON project_custom_assignees FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects WHERE id = project_id
    AND (user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = projects.id
      AND user_id = auth.uid() AND accepted = true
    ))
  )
);

CREATE INDEX IF NOT EXISTS idx_custom_assignees_project
  ON project_custom_assignees(project_id);
