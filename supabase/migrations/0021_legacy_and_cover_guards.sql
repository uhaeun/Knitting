-- Never infer historical edition identities. Explicit remaking is safe.
create or replace function prepare_result_edition(pid uuid,recipe text,remake uuid default null)
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
 if eid is null and remake is null and exists(select 1 from results r where r.project_id=pid and r.owner_id=auth.uid() and r.edition_id is null) then
   raise exception '과거 제작 버전을 확인할 수 없어요. 다시 제작해 주세요' using errcode='P0001',detail='LEGACY_EDITION_UNVERIFIED';
 end if;
 if eid is null then
   insert into result_editions(project_id,owner_id,recipe_hash,remake_request)
      values(pid,auth.uid(),recipe,remake) returning result_editions.id into eid;
 end if;
 return query select eid,case when r.id is null then 'unpublished' when r.deleted_at is null then 'published' else 'deleted' end
   from (select 1) x left join results r on r.edition_id=eid;
end $$;

create function guard_project_cover() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' or NEW.cover_post_id is distinct from OLD.cover_post_id then
   if NEW.cover_post_id is not null and not exists(select 1 from posts where id=NEW.cover_post_id and project_id=NEW.id and owner_id=NEW.owner_id and deleted_at is null) then
     raise exception '이 편물의 기록만 표지로 선택할 수 있어요' using errcode='23514';
   end if;
 end if;
 return NEW;
end $$;
create trigger projects_cover_guard before insert or update on projects for each row execute function guard_project_cover();
notify pgrst,'reload schema';
