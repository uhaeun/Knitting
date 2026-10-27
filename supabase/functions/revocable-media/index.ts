import { revocableMediaHandler } from '../_shared/revocableMedia.ts';
Deno.serve(revocableMediaHandler({
  url: Deno.env.get('SUPABASE_URL')!, anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, mediaSecret: Deno.env.get('MEDIA_SIGNING_SECRET')!,
  // The external API URL is different from the internal gateway hostname in local containers.
  publicUrl: Deno.env.get('MEDIA_PUBLIC_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/revocable-media`,
}));
