create table result_editions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references projects on delete cascade,
 owner_id uuid not null references profiles on delete cascade,
 recipe_hash text not null check(recipe_hash ~ '^[a-f0-9]{64}$'),
 remake_request uuid unique,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index on result_editions(owner_id,project_id,recipe_hash,created_at desc,id);
alter table result_editions enable row level security;
revoke all on result_editions from public,anon,authenticated;
grant select on result_editions to authenticated;
create policy edition_owner on result_editions for select to authenticated using(owner_id=auth.uid());
alter table results add column edition_id uuid references result_editions(id);
create unique index results_one_publication_per_edition on results(edition_id);

create function prepare_result_edition(pid uuid,recipe text,remake uuid default null)
returns table(id uuid,state text) language plpgsql security definer set search_path=public as $$
declare eid uuid;
begin
 if auth.uid() is null or recipe is null or recipe !~ '^[a-f0-9]{64}$' then
   raise exception '제작 정보를 확인해 주세요' using errcode='23514';
 end if;
 perform 1 from projects p where p.id=pid and p.owner_id=auth.uid() and p.deleted_at is null for update;
 if not found then raise exception '편물을 찾을 수 없어요' using errcode='P0002'; end if;
 if remake is not null then
   select e.id into eid from result_editions e where e.remake_request=remake
      and e.owner_id=auth.uid() and e.project_id=pid and e.recipe_hash=recipe;
 else
   select e.id into eid from result_editions e where e.owner_id=auth.uid() and e.project_id=pid and e.recipe_hash=recipe
     order by e.created_at desc,e.id desc limit 1;
 end if;
 if eid is null then
   insert into result_editions(project_id,owner_id,recipe_hash,remake_request)
      values(pid,auth.uid(),recipe,remake) returning result_editions.id into eid;
 end if;
 return query select eid,case when r.id is null then 'unpublished' when r.deleted_at is null then 'published' else 'deleted' end
   from (select 1) x left join results r on r.edition_id=eid;
end $$;
revoke all on function prepare_result_edition(uuid,text,uuid) from public,anon;
grant execute on function prepare_result_edition(uuid,text,uuid) to authenticated;

create function guard_result_edition() returns trigger
language plpgsql set search_path=public as $$
begin
 if TG_OP='UPDATE' then
   if NEW.edition_id is distinct from OLD.edition_id or NEW.kind<>OLD.kind or NEW.ratio<>OLD.ratio or NEW.output<>OLD.output then
     raise exception '제작 버전과 발행 원본은 바꿀 수 없어요' using errcode='23514';
   end if;
 else
   if NEW.edition_id is null then
     if current_user in ('authenticated','anon') then
       raise exception '제작 버전이 필요해요' using errcode='23514';
     end if;
   else
     if not exists(select 1 from result_editions e where e.id=NEW.edition_id and e.owner_id=NEW.owner_id and e.project_id=NEW.project_id) then
       raise exception '제작 버전의 소유자와 편물이 일치하지 않아요' using errcode='23514';
     end if;
     if NEW.id<>NEW.edition_id or NEW.file_path<>
       NEW.owner_id::text||'/'||NEW.project_id::text||'/results/'||NEW.id::text||(case when NEW.output='mp4' then '.mp4' else '.jpg' end)
       or NEW.thumb_path<>NEW.owner_id::text||'/'||NEW.project_id::text||'/results/'||NEW.id::text||'_t.jpg' then
       raise exception '결과물 파일 경로가 일치하지 않아요' using errcode='23514';
     end if;
   end if;
 end if;
 return NEW;
end $$;
create trigger results_edition before insert or update on results for each row execute function guard_result_edition();
notify pgrst,'reload schema';
