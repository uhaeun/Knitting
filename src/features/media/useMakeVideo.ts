import { useCallback, useState } from 'react';

import { makeVideo, type EncodeResult } from '@/features/media/makeVideo';
import { saveOrShare } from '@/shared/lib/saveFile';

export type MakeVideoState =
  | { status: 'idle' }
  | { status: 'encoding'; progress: number }
  | { status: 'done'; result: EncodeResult }
  | { status: 'error'; message: string };

/** 타임라인 "영상 만들기"의 상태 머신. 화면은 이 훅만 쓴다. */
export function useMakeVideo(projectId: string) {
  const [state, setState] = useState<MakeVideoState>({ status: 'idle' });

  const start = useCallback(async () => {
    setState({ status: 'encoding', progress: 0 });
    try {
      const result = await makeVideo(projectId, (p) => setState({ status: 'encoding', progress: p.progress }));
      setState({ status: 'done', result });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [projectId]);

  /** 폰: 공유 창 → "비디오 저장". 공유 창이 없는 브라우저: 파일 내려받기 */
  const save = useCallback(async () => {
    if (state.status !== 'done') return;
    await saveOrShare(state.result.file, state.result.uri);
  }, [state]);

  const reset = useCallback(() => {
    if (state.status === 'done') URL.revokeObjectURL(state.result.uri);
    setState({ status: 'idle' });
  }, [state]);

  return { state, start, save, reset };
}
