-- The device supplies an IANA time-zone name, never a trusted 'today' value.
alter table projects add column time_zone text not null default 'UTC';
create function validate_project_dates() returns trigger
language plpgsql set search_path=public as $$
declare today date;
begin
 if TG_OP='UPDATE' and NEW.started_at is not distinct from OLD.started_at
   and NEW.finished_at is not distinct from OLD.finished_at and NEW.time_zone=OLD.time_zone then return NEW; end if;
 if not exists(select 1 from pg_timezone_names where name=NEW.time_zone) then
   raise exception '시간대를 확인해 주세요' using errcode='23514';
 end if;
 today:=(clock_timestamp() at time zone NEW.time_zone)::date;
 if NEW.started_at>today or NEW.finished_at>today then
   raise exception '미래 날짜는 저장할 수 없어요' using errcode='23514';
 end if;
 if NEW.finished_at<NEW.started_at then
   raise exception '완성일이 시작일보다 앞이에요' using errcode='23514';
 end if;
 return NEW;
end $$;
create trigger projects_dates before insert or update on projects for each row execute function validate_project_dates();
notify pgrst,'reload schema';
