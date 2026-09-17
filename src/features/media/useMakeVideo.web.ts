import { useCallback, useState } from 'react';

import { makeVideo } from '@/features/media/makeVideo';
import type { MakeVideoState } from '@/features/media/useMakeVideo';

/** 웹 전용. 앨범 대신 파일로 내려받고, 공유는 브라우저 공유 시트(Web Share)를 쓴다. */
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
    const a = document.createElement('a');
    a.href = state.result.uri;
    a.download = `knitting-${projectId}.mp4`;
    a.click();
    setState({ ...state, savedToAlbum: true });
  }, [projectId, state]);

  const share = useCallback(async () => {
    if (state.status !== 'done') return;
    const blob = await (await fetch(state.result.uri)).blob();
    const file = new File([blob], 'knitting.mp4', { type: 'video/mp4' });
    if (!navigator.canShare?.({ files: [file] })) {
      throw new Error('이 브라우저에서는 공유를 쓸 수 없어요. 저장한 뒤 직접 보내 주세요.');
    }
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // 사용자가 닫음
      throw e;
    }
  }, [state]);

  const reset = useCallback(() => {
    if (state.status === 'done') URL.revokeObjectURL(state.result.uri);
    setState({ status: 'idle' });
  }, [state]);

  return { state, start, saveToAlbum, share, reset };
}
