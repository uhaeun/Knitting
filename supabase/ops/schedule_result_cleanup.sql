-- Install only in the intended isolated/staging project after functions and
-- Vault entries have been configured. No production execution in this audit.
-- Vault names: knitting_cleanup_function_url, knitting_cleanup_worker_secret.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists private;
create or replace function private.dispatch_result_cleanup() returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare endpoint text;secret text;n int;
begin
 if (select count(*) from vault.decrypted_secrets where name='knitting_cleanup_function_url')<>1
 or (select count(*) from vault.decrypted_secrets where name='knitting_cleanup_worker_secret')<>1 then
  raise exception 'Cleanup worker Vault configuration is missing or ambiguous';end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='knitting_cleanup_function_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='knitting_cleanup_worker_secret';
 if endpoint !~ '^https?://[^/]+/functions/v1/cleanup-results$' or length(secret)<32 then raise exception 'Invalid cleanup worker configuration';end if;
 -- Bounded parallel invocations; SKIP LOCKED and leases isolate jobs.
 for n in 1..3 loop
  perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Authorization','Bearer '||secret),timeout_milliseconds:=120000);
 end loop;
end $$;
revoke all on schema private from public,anon,authenticated;
revoke all on function private.dispatch_result_cleanup() from public,anon,authenticated;
select cron.schedule('knitting-result-cleanup','* * * * *','select private.dispatch_result_cleanup()');
