-- 영상 기록: 매일 기록에 최대 5초 영상도 올린다.
-- 영상 기록도 photo_path·thumb_path에 첫 장면(대표 사진)을 넣는다 → 목록·피드·고스트는 변경 없이 동작.

alter table posts
  add column media_type text not null default 'photo' check (media_type in ('photo', 'video')),
  add column video_path text,
  add column duration_ms int;

-- 영상이면 경로·길이 필수(5.5초 이하, 인코딩 여유), 사진이면 둘 다 비어 있어야 한다
alter table posts add constraint posts_video_fields check (
  (media_type = 'photo' and video_path is null and duration_ms is null)
  or (media_type = 'video' and video_path is not null and duration_ms between 1 and 5500)
);

-- 버킷: MP4 허용, 용량 제한 5MB → 10MB
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'video/mp4'], file_size_limit = 10485760
where id = 'photos';

-- 읽기: 본인 폴더이거나, 그 파일(사진·썸네일·영상)을 쓰는 게시물이 보일 때 (posts 정책 상속)
-- 게시물은 작성자 폴더의 파일만 열어 준다. *_path는 아무 글자나 들어가므로, 남의 비공개 파일 키를
-- 내 공개 게시물에 적어 읽어 가는 것을 막는다.
drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.posts p
        where (p.photo_path = name or p.thumb_path = name or p.video_path = name)
          and p.owner_id::text = (storage.foldername(name))[1]
      )
    )
  );
