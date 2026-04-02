-- ============================================================================
-- Migration 035: Create attachments storage bucket for messaging
-- ============================================================================
-- Creates the Supabase Storage bucket used by the doctor/patient messaging
-- attachment upload feature. The bucket is public so getPublicUrl() works
-- without signed URLs. File-size enforcement is done client-side (5MB cap).
-- ============================================================================

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  true,
  5242880,  -- 5 MB in bytes
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── RLS Policies ─────────────────────────────────────────────────────────────

-- Allow authenticated users to upload to messages/ path
CREATE POLICY "Authenticated users can upload message attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND name LIKE 'messages/%'
);

-- Allow public read access (bucket is public)
CREATE POLICY "Public read access for attachments"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'attachments');

-- Allow uploaders to delete their own files
CREATE POLICY "Authenticated users can delete own attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND auth.uid() = owner
);
