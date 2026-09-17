import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { pickRecorderMime } from '@/features/capture/clip';
import { color, fontSize, space } from '@/shared/ui/tokens';

/**
 * 카메라 뷰. expo-camera의 웹 구현은 해상도를 지정하지 않아 브라우저 기본값(보통 640×480)을 받는다.
 * 그러면 정사각 크롭 결과가 480px에 그쳐 1440px 저장 규칙을 못 지키므로, 직접 getUserMedia로 높은 해상도를 요청한다.
 * (권한 확인만 expo-camera의 useCameraPermissions를 쓴다)
 * 촬영 화면이 쓰는 표면(ref.takePictureAsync, onCameraReady, style)만 맞춘다.
 */

type Shot = { uri: string; width: number; height: number };
export type WebCameraHandle = {
  takePictureAsync: (options?: object) => Promise<Shot>;
  /** 녹화 시작. 이미 녹화 중이면 무시 */
  startRecording: () => void;
  /** 녹화 끝. 녹화 원본 Blob */
  stopRecording: () => Promise<Blob>;
};

type Props = {
  ref?: Ref<WebCameraHandle>;
  facing?: 'back' | 'front';
  /** 영상 모드는 정사각 크기를 요청하지 않는다 (녹화 파일이 눌려 기록되는 것을 피함) */
  mode?: 'photo' | 'video';
  onCameraReady?: () => void;
  /**
   * 스트림이 열린 동안 끊겼을 때 (영상 트랙 ended, 화면 숨김(전화·앱 전환), 녹화기 오류). 끊김마다 한 번.
   * 이후 화면이 다시 보이면 스트림을 다시 열고 재생되면 onCameraReady를 다시 부른다.
   */
  onInterrupted?: () => void;
  style?: { width?: number; height?: number; marginTop?: number };
  animateShutter?: boolean;
};

/** 짧은 변이 1440 이상 나오도록 넉넉히. 브라우저가 가능한 가장 가까운 값을 고른다 */
const IDEAL_SIDE = 2560;
const JPEG_QUALITY = 0.95;
/** 영상 모드: 가로만 요청. 정사각 요청 시 iPhone 녹화본이 눌려 기록되는 문제를 피한다 (설계 0절) */
const VIDEO_IDEAL_WIDTH = 1920;

export function CameraView({ ref, facing = 'back', mode = 'photo', onCameraReady, onInterrupted, style }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; chunks: Blob[]; done: Promise<void> } | null>(null);
  /** 끊긴 뒤 스트림을 다시 열 때 올린다 (effect 재실행) */
  const [session, setSession] = useState(0);
  /** 지금 열린 스트림의 끊김 처리. 녹화기 오류에서 부른다 */
  const interruptRef = useRef<(() => void) | null>(null);
  // 화면이 매 렌더마다 새 콜백을 넘기므로 ref로 받아 스트림을 다시 열지 않는다
  const onReady = useRef(onCameraReady);
  const onInterrupt = useRef(onInterrupted);
  useEffect(() => {
    onReady.current = onCameraReady;
    onInterrupt.current = onInterrupted;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    let interrupted = false;
    const reopen = () => {
      if (cancelled) return;
      setError(null);
      setSession((n) => n + 1);
    };
    // 전화·앱 전환·트랙 종료·녹화기 오류: 화면에 한 번만 알리고(녹화 중이면 거기까지 저장), 보이는 상태면 바로 다시 연다
    const interrupt = () => {
      if (cancelled || interrupted || !stream) return;
      interrupted = true;
      onInterrupt.current?.();
      if (document.visibilityState === 'visible') reopen();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') interrupt();
      else if (interrupted) reopen();
    };
    interruptRef.current = interrupt;
    document.addEventListener('visibilitychange', onVisibility);
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video:
          mode === 'video'
            ? { facingMode: { ideal: facing === 'back' ? 'environment' : 'user' }, width: { ideal: VIDEO_IDEAL_WIDTH } }
            : {
                facingMode: { ideal: facing === 'back' ? 'environment' : 'user' },
                width: { ideal: IDEAL_SIDE },
                height: { ideal: IDEAL_SIDE },
              },
      })
      .then(async (s) => {
        if (cancelled) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        stream = s;
        streamRef.current = s;
        for (const t of s.getVideoTracks()) t.addEventListener('ended', interrupt);
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        await v.play();
        // 재생을 기다리는 사이 모드가 바뀌어 이 스트림이 정리됐으면 준비 완료를 알리지 않는다
        // (늦게 온 알림이 새 스트림이 붙기 전에 셔터를 켜 "카메라가 아직 준비되지 않았어요"가 났다)
        if (cancelled) return;
        onReady.current?.();
      })
      .catch((e: unknown) => {
        // 권한은 있는데 다른 앱이 카메라를 쓰는 중(NotReadableError) 등. 셔터는 비활성인 채로 두고 이유를 보여 준다
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (interruptRef.current === interrupt) interruptRef.current = null;
      if (recorder.current) {
        recorder.current.rec.stop();
        recorder.current = null;
      }
      for (const t of stream?.getVideoTracks() ?? []) t.removeEventListener('ended', interrupt);
      for (const t of stream?.getTracks() ?? []) t.stop();
      streamRef.current = null;
    };
  }, [facing, mode, session]);

  useImperativeHandle(ref, () => ({
    takePictureAsync: async () => {
      const v = video.current;
      if (!v || v.videoWidth === 0) throw new Error('카메라가 아직 준비되지 않았어요');
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('사진을 만들지 못했어요');
      ctx.drawImage(v, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('사진을 만들지 못했어요');
      return { uri: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
    },
    startRecording: () => {
      const s = streamRef.current;
      if (!s) throw new Error('카메라가 아직 준비되지 않았어요');
      if (recorder.current) throw new Error('이미 녹화 중이에요');
      const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error('이 브라우저에서는 영상을 녹화할 수 없어요');
      const rec = new MediaRecorder(s, { mimeType: mime });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const done = new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        // 오류 뒤 stop 이벤트가 안 올 수도 있어 기다림을 풀어 둔다
        rec.onerror = () => {
          resolve();
          interruptRef.current?.();
        };
      });
      rec.start(250);
      recorder.current = { rec, chunks, done };
    },
    stopRecording: async () => {
      const r = recorder.current;
      if (!r) throw new Error('녹화 중이 아니에요');
      // 재진입(중복 stop) 방지: await 전에 즉시 비워 둔다
      recorder.current = null;
      if (r.rec.state !== 'inactive') r.rec.stop();
      await r.done;
      return new Blob(r.chunks, { type: r.rec.mimeType });
    },
  }));

  if (error) {
    return (
      <div
        style={{
          ...style,
          display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          padding: space.xl, boxSizing: 'border-box',
          color: color.onDark, fontSize: fontSize.caption,
        }}
      >
        카메라를 열지 못했어요. 다른 앱이 카메라를 쓰고 있는지 확인하거나, 아래 앨범 버튼으로 사진을 가져오세요. ({error})
      </div>
    );
  }

  return (
    <video
      ref={video}
      autoPlay
      muted
      playsInline
      style={{ ...style, display: 'block', objectFit: 'cover' }}
    />
  );
}
