import type { Post, Project } from '@/shared/types/models';

/** Signed URLs and cache timestamps never define a new logical production version. */
export function resultRecipe(project: Pick<Project, 'id' | 'name' | 'started_at'>, posts: readonly Post[], options: object): string {
  return JSON.stringify({
    project: { id: project.id, name: project.name, started_at: project.started_at }, options,
    posts: posts.map((p) => ({ id: p.id, taken_at: p.taken_at, caption: p.caption,
      media_type: p.media_type, duration_ms: p.duration_ms, width: p.width, height: p.height })),
  });
}
export async function hashRecipe(recipe: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recipe));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
