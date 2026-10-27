import { forgetSignedUrls, signPaths } from '../remote';
let mockUser: string | null = 'a';
const mockSign = jest.fn();
jest.mock('@/features/auth/store', () => ({ useAuth: { getState: () => ({ session: mockUser ? { user: { id: mockUser } } : null }) } }));
jest.mock('@/shared/lib/supabase', () => ({ PHOTOS_BUCKET: 'photos', getSupabase: () => ({ functions: { invoke: async () => ({ data: { urls: [] }, error: null }) }, storage: { from: () => ({ createSignedUrls: mockSign }) } }) }));
beforeEach(() => { mockUser = 'a'; forgetSignedUrls(); mockSign.mockReset(); });
it('discards a late signing response from an earlier account', async () => {
  let finish!: (result: object) => void;
  mockSign.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = signPaths(['a/private.jpg']);
  await Promise.resolve();
  mockUser = 'b';
  finish({ data: [{ path: 'a/private.jpg', signedUrl: 'old-a-url' }], error: null });
  await expect(pending).rejects.toThrow('계정이나 공개 범위');
  mockSign.mockResolvedValue({ data: [], error: null });
  expect((await signPaths(['a/private.jpg'])).size).toBe(0);
  expect(mockSign).toHaveBeenCalledTimes(2);
});
it('does not repopulate the URL cache after a privacy invalidation', async () => {
  let finish!: (result: object) => void;
  mockSign.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = signPaths(['a/result.jpg']);
  await Promise.resolve();
  forgetSignedUrls();
  finish({ data: [{ path: 'a/result.jpg', signedUrl: 'before-private' }], error: null });
  await expect(pending).rejects.toThrow('계정이나 공개 범위');
  mockSign.mockResolvedValue({ data: [{ path: 'a/result.jpg', signedUrl: 'after-revalidation' }], error: null });
  expect((await signPaths(['a/result.jpg'])).get('a/result.jpg')).toBe('after-revalidation');
});
it('discards pending private URLs on logout', async () => {
  let finish!: (result: object) => void;
  mockSign.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = signPaths(['a/private.jpg']);
  await Promise.resolve();
  mockUser = null;
  finish({ data: [{ path: 'a/private.jpg', signedUrl: 'private-url' }], error: null });
  await expect(pending).rejects.toThrow('계정이나 공개 범위');
});
