import { resultRecipe } from '../edition';
import type { Post } from '@/shared/types/models';
const project = { id: 'project', name: '목도리', started_at: '2026-10-01' };
const post: Post = { id: 'post', project_id: 'project', media_type: 'photo', photo_path: 'signed-url-one', thumb_path: 'thumb-url-one', video_path: null, duration_ms: null, width: 1440, height: 1440, caption: '메모', taken_at: '2026-10-01T00:00:00Z', visibility: 'private', created_at: '', updated_at: '', deleted_at: null };
it('reuses the same logical edition after signed URL renewal or a visibility update', () => {
  expect(resultRecipe(project, [post], { ratio: '1:1' })).toBe(resultRecipe(project, [{ ...post, photo_path: 'renewed-url', thumb_path: 'new-thumb', visibility: 'public', updated_at: 'later' }], { ratio: '1:1' }));
});
it.each(['caption', 'taken_at', 'id'] as const)('a changed source %s defines a new edition', (field) => {
  expect(resultRecipe(project, [post], {})).not.toBe(resultRecipe(project, [{ ...post, [field]: 'changed' }], {}));
});
it('preserves source order and actual render options in the production identity', () => {
  const second = { ...post, id: 'second' };
  expect(resultRecipe(project, [post, second], {})).not.toBe(resultRecipe(project, [second, post], {}));
  expect(resultRecipe(project, [post], { ratio: '1:1' })).not.toBe(resultRecipe(project, [post], { ratio: '4:5' }));
});
