-- Run in Supabase SQL editor after replacing bucket name if needed.
-- Bucket: ermunai-product-images

insert into storage.buckets (id, name, public)
values ('ermunai-product-images', 'ermunai-product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read Ermunai images" on storage.objects;
create policy "Public read Ermunai images"
on storage.objects for select
using (bucket_id = 'ermunai-product-images');

drop policy if exists "Authenticated image uploads" on storage.objects;
create policy "Authenticated image uploads"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ermunai-product-images'
  and lower((storage.foldername(name))[1]) in ('products', 'blogs', 'recipes', 'banners', 'categories')
);

drop policy if exists "Authenticated image updates" on storage.objects;
create policy "Authenticated image updates"
on storage.objects for update
to authenticated
using (
  bucket_id = 'ermunai-product-images'
  and lower((storage.foldername(name))[1]) in ('products', 'blogs', 'recipes', 'banners', 'categories')
)
with check (
  bucket_id = 'ermunai-product-images'
  and lower((storage.foldername(name))[1]) in ('products', 'blogs', 'recipes', 'banners', 'categories')
);

drop policy if exists "Authenticated image deletes" on storage.objects;
create policy "Authenticated image deletes"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'ermunai-product-images'
  and lower((storage.foldername(name))[1]) in ('products', 'blogs', 'recipes', 'banners', 'categories')
);
