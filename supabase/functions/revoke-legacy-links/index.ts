import { linkRevocationHandler } from '../_shared/linkRevocation.ts';
Deno.serve(linkRevocationHandler({
  url: Deno.env.get('SUPABASE_URL')!, anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, workerSecret: Deno.env.get('REVOCATION_WORKER_SECRET')!,
  publicStorageUrl: Deno.env.get('REVOCATION_STORAGE_PUBLIC_URL')!,
  verification: Deno.env.get('REVOCATION_VERIFICATION') === 'cdn' ? 'cdn' : 'origin',
}));
