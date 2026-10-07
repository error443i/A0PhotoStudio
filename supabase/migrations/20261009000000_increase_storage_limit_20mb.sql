-- Increase portfolio-photos bucket file size limit to 20MB and allow all image formats
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = null
where id = 'portfolio-photos';

notify pgrst, 'reload schema';
