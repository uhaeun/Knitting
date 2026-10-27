-- Result upload keys are stable across devices and retries. Client-side failure
-- cleanup cannot distinguish its upload from another device's successful one.
-- Preserve staged objects for server reconciliation; published/deleted objects
-- are only physically changed by the separately authorized server cleanup path.
create function guard_result_storage_mutation() returns trigger
language plpgsql set search_path=public as $$
begin
 if current_user in ('authenticated','anon') and (
   (OLD.bucket_id='photos' and OLD.name like '%/results/%') or
   (TG_OP='UPDATE' and NEW.bucket_id='photos' and NEW.name like '%/results/%')) then
   raise exception '결과물 파일 정리는 서버에서 처리해요' using errcode='42501';
 end if;
 if TG_OP='DELETE' then return OLD;end if;
 return NEW;
end $$;
create trigger result_storage_immutable before update or delete on storage.objects
 for each row execute function guard_result_storage_mutation();
notify pgrst,'reload schema';
