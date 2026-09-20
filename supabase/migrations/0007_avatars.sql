-- 프로필 사진. photos와 달리 공개 버킷이다 (피드·탐색에서 남의 사진도 보여야 하고,
-- 서명 URL을 사람 수만큼 발급하면 목록 한 번에 요청이 수십 개가 된다).
-- 경로: avatars/{user_id}/avatar-{timestamp}.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 공개 버킷이라 누구나 읽을 수 있다. upsert가 기존 파일을 확인할 때도 이 정책이 필요하다
create policy avatars_select on storage.objects for select
  using (bucket_id = 'avatars');
