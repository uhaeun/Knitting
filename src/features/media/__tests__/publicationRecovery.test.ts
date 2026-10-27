import { publishResult } from '../resultsRepository';
const mockRemove = jest.fn();
const mockUpload = jest.fn();
const mockRpc = jest.fn();
const mockInsert = jest.fn();
jest.mock('@/shared/lib/remote', () => ({ requireUserId: () => 'owner' }));
jest.mock('@/shared/lib/supabase', () => ({
  PHOTOS_BUCKET: 'photos',
  remoteResultPath: () => 'owner/project/results/edition.jpg',
  remoteResultThumbPath: () => 'owner/project/results/edition_t.jpg',
  getSupabase: () => ({
    rpc: mockRpc,
    from: () => ({ insert: mockInsert }),
    storage: { from: () => ({ upload: mockUpload, remove: mockRemove }) },
  }),
}));
const input = {
  projectId: 'project', kind: 'single' as const, ratio: '1:1' as const,
  visibility: 'private' as const, recipeHash: 'a'.repeat(64),
  composed: { output: 'jpeg', file: { type: 'image/jpeg' }, posterBlob: {} },
} as Parameters<typeof publishResult>[0];
beforeEach(() => {
  jest.resetAllMocks();
  mockRpc.mockResolvedValue({ data: [{ id: 'edition', state: 'unpublished' }], error: null });
});
it('does not erase another device publication when the shared file exists and the thumbnail upload fails', async () => {
  mockUpload.mockResolvedValueOnce({ error: { message: 'The resource already exists' } })
    .mockResolvedValueOnce({ error: { message: 'network timeout' } });
  await expect(publishResult(input)).rejects.toThrow('대표 이미지를 올리지 못했어요');
  expect(mockRemove).not.toHaveBeenCalled();
  expect(mockInsert).not.toHaveBeenCalled();
});
it('retains stable uploaded objects after an uncertain insert and unpublished recovery snapshot', async () => {
  mockUpload.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: { message: 'response lost' } });
  await expect(publishResult(input)).rejects.toThrow('발행 상태를 다시 확인해 주세요');
  expect(mockRemove).not.toHaveBeenCalled();
});
it('treats a committed publication after response loss as success without deleting shared files', async () => {
  mockUpload.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: { message: 'response lost' } });
  mockRpc.mockResolvedValueOnce({ data: [{ id: 'edition', state: 'unpublished' }], error: null })
    .mockResolvedValueOnce({ data: [{ id: 'edition', state: 'published' }], error: null });
  await expect(publishResult(input)).resolves.toBeUndefined();
  expect(mockRemove).not.toHaveBeenCalled();
});
