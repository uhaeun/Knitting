import { resultCleanupHandler } from '../_shared/resultCleanup.ts';
Deno.serve(resultCleanupHandler({
  url: Deno.env.get('SUPABASE_URL')!, anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, workerSecret: Deno.env.get('CLEANUP_WORKER_SECRET')!,
}));
