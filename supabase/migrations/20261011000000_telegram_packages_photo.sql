-- Add image_url and storage_path columns to telegram_packages table
alter table public.telegram_packages 
  add column if not exists image_url text,
  add column if not exists storage_path text;

notify pgrst, 'reload schema';
