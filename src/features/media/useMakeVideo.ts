import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';

import { makeVideo } from '@/features/media/makeVideo';
import type { EncodeResult } from '../../../modules/video-encoder';

export type MakeVideoState =
  | { status: 'idle' }
  | { status: 'encoding'; progress: number }
  | { status: 'done'; result: EncodeResult; savedToAlbum: boolean }
  | { status: 'error'; message: string };

/** 타임라인 "영상 만들기"의 상태 머신. 화면은 이 훅만 쓴다. */
export function useMakeVideo(projectId: string) {
  const [state, setState] = useState<MakeVideoState>({ status: 'idle' });

  const start = useCallback(async () => {
    setState({ status: 'encoding', progress: 0 });
    try {
      const result = await makeVideo(projectId, (p) => setState({ status: 'encoding', progress: p.progress }));
      setState({ status: 'done', result, savedToAlbum: false });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [projectId]);

  const saveToAlbum = useCallback(async () => {
    if (state.status !== 'done') return;
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) throw new Error('앨범 저장 권한이 없어요. 설정에서 켜 주세요.');
    await MediaLibrary.saveToLibraryAsync(state.result.uri);
    setState({ ...state, savedToAlbum: true });
  }, [state]);

  const share = useCallback(async () => {
    if (state.status !== 'done') return;
    if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 공유를 쓸 수 없어요');
    await Sharing.shareAsync(state.result.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
  }, [state]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, saveToAlbum, share, reset };
}
