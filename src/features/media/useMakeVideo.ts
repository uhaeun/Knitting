import { useCallback, useEffect, useRef, useState } from 'react';

import { makeVideo, type EncodeResult } from '@/features/media/makeVideo';
import { saveOrShare } from '@/shared/lib/saveFile';

export type MakeVideoState =
  | { status: 'idle' }
  | { status: 'encoding'; progress: number }
  | { status: 'done'; result: EncodeResult }
  | { status: 'error'; message: string };

/** 타임라인 "영상 만들기"의 상태 머신. 화면은 이 훅만 쓴다. 화면을 떠나면 만들던 영상을 취소하고 결과 URL을 해제한다. */
export function useMakeVideo(projectId: string) {
  const [state, setState] = useState<MakeVideoState>({ status: 'idle' });
  const job = useRef<AbortController | null>(null);
  const doneUri = useRef<string | null>(null);

  const releaseDone = () => {
    if (doneUri.current) URL.revokeObjectURL(doneUri.current);
    doneUri.current = null;
  };

  useEffect(
    () => () => {
      job.current?.abort();
      releaseDone();
    },
    [],
  );

  const start = useCallback(async () => {
    job.current?.abort();
    releaseDone();
    const controller = new AbortController();
    job.current = controller;
    const { signal } = controller;
    setState({ status: 'encoding', progress: 0 });
    try {
      const result = await makeVideo(
        projectId,
        (p) => {
          if (!signal.aborted) setState({ status: 'encoding', progress: p.progress });
        },
        signal,
      );
      if (signal.aborted) {
        URL.revokeObjectURL(result.uri);
        return;
      }
      doneUri.current = result.uri;
      setState({ status: 'done', result });
    } catch (e) {
      if (signal.aborted) return;
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (job.current === controller) job.current = null;
    }
  }, [projectId]);

  /** 폰: 공유 창 → "비디오 저장". 공유 창이 없는 브라우저: 파일 내려받기 */
  const save = useCallback(async () => {
    if (state.status !== 'done') return;
    await saveOrShare(state.result.file, state.result.uri);
  }, [state]);

  const reset = useCallback(() => {
    job.current?.abort();
    releaseDone();
    setState({ status: 'idle' });
  }, []);

  return { state, start, save, reset };
}
