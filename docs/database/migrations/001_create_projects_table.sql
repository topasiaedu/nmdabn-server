-- Create projects table
-- This table allows workspaces to organize their data into separate projects/campaigns/funnels

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on workspace_id for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON public.projects(workspace_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see projects in their workspaces
CREATE POLICY "Users can view projects in their workspaces"
    ON public.projects
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Create policy: Users can insert projects in their workspaces
CREATE POLICY "Users can create projects in their workspaces"
    ON public.projects
    FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Create policy: Users can update projects in their workspaces
CREATE POLICY "Users can update projects in their workspaces"
    ON public.projects
    FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Create policy: Users can delete projects in their workspaces
CREATE POLICY "Users can delete projects in their workspaces"
    ON public.projects
    FOR DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE public.projects IS 'Projects within a workspace for organizing campaigns, funnels, webinars, etc.';
COMMENT ON COLUMN public.projects.workspace_id IS 'The workspace this project belongs to';
COMMENT ON COLUMN public.projects.name IS 'Project name (e.g., "Q1 Webinar Series", "Product Launch Campaign")';
COMMENT ON COLUMN public.projects.description IS 'Optional project description';
