-- Newly issued result URLs are HMAC capabilities validated on every download.
-- Preexisting Storage-signed URLs remain explicitly unverified until separate rotation/CDN QA.
alter table results add column media_epoch bigint not null default 1 check(media_epoch>0);
alter table results add column legacy_links_unverified boolean not null default true;
alter table results alter column legacy_links_unverified set default false;
create function guard_media_epoch() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' then
   if current_user='authenticated' then NEW.media_epoch:=1;NEW.legacy_links_unverified:=false;end if;
 else
   if current_user='authenticated' and (NEW.media_epoch<>OLD.media_epoch or NEW.legacy_links_unverified<>OLD.legacy_links_unverified) then
     raise exception '미디어 보안 상태는 서버에서 관리해요' using errcode='42501';
   end if;
   if NEW.visibility<>OLD.visibility or NEW.deleted_at is distinct from OLD.deleted_at then
     if OLD.media_epoch=9223372036854775807 then raise exception '미디어 버전 점검이 필요해요' using errcode='22003';end if;
     NEW.media_epoch:=OLD.media_epoch+1;
   end if;
 end if;
 return NEW;
end $$;
create trigger results_media_epoch before insert or update on results for each row execute function guard_media_epoch();

-- Internal visibility predicate shared by row RLS and the signed download gateway.
create function result_visible_to(rid uuid,viewer uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from results r join profiles p on p.id=r.owner_id join projects pr on pr.id=r.project_id
 where r.id=rid and viewer is not null and r.deleted_at is null and p.deleted_at is null and p.deletion_requested_at is null
 and (r.owner_id=viewer or (
   not is_blocked_pair(r.owner_id,viewer) and (not p.is_private or is_accepted_follower(viewer,r.owner_id))
   and (pr.deleted_at is not null or pr.default_visibility='public' or (pr.default_visibility='followers' and is_accepted_follower(viewer,r.owner_id)))
   and (r.visibility='public' or (r.visibility='followers' and is_accepted_follower(viewer,r.owner_id))))));
$$;
revoke all on function result_visible_to(uuid,uuid) from public,anon,authenticated;
create function result_visible(rid uuid) returns boolean
language sql stable security definer set search_path=public as $$select result_visible_to(rid,auth.uid())$$;
revoke all on function result_visible(uuid) from public,anon;
grant execute on function result_visible(uuid) to authenticated;
drop policy results_select on results;
create policy results_select on results for select to authenticated using(result_visible(id));

create function resolve_result_assets(keys text[]) returns table(result_id uuid,path text,asset text,epoch text)
language plpgsql security invoker set search_path=public as $$
begin
 if coalesce(array_length(keys,1),0)>500 then raise exception '요청이 너무 커요' using errcode='22023';end if;
 return query select r.id,k.path,case when r.file_path=k.path then 'file' else 'thumb' end,r.media_epoch::text
 from results r join unnest(keys) k(path) on k.path=r.file_path or k.path=r.thumb_path;
end $$;
revoke all on function resolve_result_assets(text[]) from public,anon;
grant execute on function resolve_result_assets(text[]) to authenticated;
create function result_media_target(rid uuid,viewer uuid,epoch text,asset text)
returns table(path text,output text,owner_id uuid,project_id uuid) language sql stable security definer set search_path=public as $$
 select case when asset='file' then r.file_path else r.thumb_path end,case when asset='file' then r.output else 'jpeg' end,r.owner_id,r.project_id
 from results r where r.id=rid and asset in ('file','thumb') and r.media_epoch::text=epoch and result_visible_to(rid,viewer);
$$;
revoke all on function result_media_target(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function result_media_target(uuid,uuid,text,text) to service_role;

-- Never let a malformed historical result reference classify another owner's raw
-- post as a result; application result objects have their own /results/ namespace.
create or replace function is_result_object(object_name text) returns boolean
language sql stable security definer set search_path=public as $$select object_name like '%/results/%'$$;

-- No client can bypass the gateway by minting fresh Storage-signed result URLs.
drop policy photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated using (
 bucket_id='photos' and not is_result_object(name) and (
 (storage.foldername(name))[1]=auth.uid()::text
 or exists(select 1 from public.posts p where p.owner_id::text=(storage.foldername(name))[1]
   and (p.photo_path=name or p.thumb_path=name or p.video_path=name))));

-- Sanitized legacy risk view includes individually deleted results, without media keys/URLs.
create function my_legacy_link_risks() returns table(id uuid,title text,deleted_at timestamptz,kind text,status text)
language sql stable security definer set search_path=public as $$
 select r.id,coalesce(r.display_title_override,r.project_name_snapshot,'이전 결과물'),r.deleted_at,r.kind,'verification_pending'::text
 from results r where r.owner_id=auth.uid() and r.legacy_links_unverified and (r.visibility='private' or r.deleted_at is not null)
 order by r.created_at desc,r.id;
$$;
revoke all on function my_legacy_link_risks() from public,anon;
grant execute on function my_legacy_link_risks() to authenticated;
notify pgrst,'reload schema';
