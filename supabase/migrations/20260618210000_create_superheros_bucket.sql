-- Private bucket for Lesson 4 superhero selfies and generated portraits (access via signed URLs).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'superheros',
  'superheros',
  false,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;
