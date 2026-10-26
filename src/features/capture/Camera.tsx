import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { pickRecorderMime } from '@/features/capture/clip';
import { drawSquare, encodeJpeg, PHOTO_SIDE, pinchedZoom, squareCapture } from '@/features/capture/image';
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
  /**
   * 확대 배율 (1 이상). 기기 카메라가 줌을 지원하면(안드로이드 크롬 등) 카메라 자체 줌이라 화질이 그대로고
   * 영상 녹화에도 반영된다. 지원하지 않으면(iPhone Safari) 사진에서만 프레임을 오려 늘리는 디지털 줌이라 화질이 떨어진다.
   */
  zoom?: number;
  /** 지금 줌을 바꿀 수 있는 범위. 스트림이 열릴 때마다 한 번 알린다 (hardware: 기기 카메라 자체 줌) */
  onZoomCapability?: (cap: { hardware: boolean; max: number }) => void;
  /** 두 손가락으로 벌리고 모을 때 새 배율. zoomMax는 화면이 정한 최대 배율 */
  onZoomChange?: (zoom: number) => void;
  zoomMax?: number;
};

type ZoomCapabilities = { zoom?: { min: number; max: number } };
type ZoomConstraintSet = { zoom?: number };

/** 짧은 변이 1440 이상 나오도록 넉넉히. 브라우저가 가능한 가장 가까운 값을 고른다 */
const IDEAL_SIDE = 2560;
/** 저장 단계에서 q80으로 한 번 더 인코딩하므로 여기서는 손실을 거의 안 주는 값 */
const JPEG_QUALITY = 0.95;
/** 영상 모드: 가로만 요청. 정사각 요청 시 iPhone 녹화본이 눌려 기록되는 문제를 피한다 (설계 0절) */
const VIDEO_IDEAL_WIDTH = 1920;

export function CameraView({ ref, facing = 'back', mode = 'photo', onCameraReady, onInterrupted, style, zoom = 1, zoomMax = 3, onZoomCapability, onZoomChange }: Props) {
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
  const onCapability = useRef(onZoomCapability);
  const onZoom = useRef(onZoomChange);
  const zoomRef = useRef(zoom);
  const zoomMaxRef = useRef(zoomMax);
  /** 기기 카메라 자체 줌을 쓸 수 있는 스트림인가 */
  const [hardwareZoom, setHardwareZoom] = useState(false);
  const hardwareRef = useRef(false);
  const zoomable = mode === 'photo' || hardwareZoom;
  const zoomableRef = useRef(zoomable);
  useEffect(() => {
    onReady.current = onCameraReady;
    onInterrupt.current = onInterrupted;
    onCapability.current = onZoomCapability;
    onZoom.current = onZoomChange;
    zoomRef.current = zoom;
    zoomMaxRef.current = zoomMax;
    zoomableRef.current = zoomable;
  });

  // 카메라 자체 줌 적용. 손가락을 움직이는 동안 연달아 부르므로 가장 최근 값만 이어서 적용한다
  const zoomJob = useRef<{ running: boolean; pending: number | null }>({ running: false, pending: null });
  const applyHardwareZoom = (value: number) => {
    const job = zoomJob.current;
    job.pending = value;
    if (job.running) return;
    job.running = true;
    void (async () => {
      while (job.pending !== null) {
        const next = job.pending;
        job.pending = null;
        const track = streamRef.current?.getVideoTracks()[0];
        try {
          await track?.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet & ZoomConstraintSet] });
        } catch {
          // 줌을 거부하는 기기: 이전 배율로 남는다
        }
      }
      job.running = false;
    })();
  };
  useEffect(() => {
    if (hardwareZoom) applyHardwareZoom(zoom);
    // applyHardwareZoom은 ref만 쓰므로 배율이 바뀔 때만 다시 적용하면 된다
  }, [zoom, hardwareZoom]);

  // 두 손가락 벌리기·모으기. 카메라를 담은 정사각 영역 전체에서 받는다 (겹친 안내 요소는 터치를 가로채지 않는다)
  useEffect(() => {
    const host = video.current?.parentElement;
    if (!host) return;
    const previousTouchAction = host.style.touchAction;
    host.style.touchAction = 'none'; // 브라우저 자체 확대·스크롤이 손가락을 가져가지 않게
    const points = new Map<number, { x: number; y: number }>();
    let start: { distance: number; zoom: number } | null = null;
    const distance = () => {
      const [a, b] = [...points.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (e: PointerEvent) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = points.size === 2 && zoomableRef.current ? { distance: distance(), zoom: zoomRef.current } : null;
    };
    const move = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (start && points.size === 2) onZoom.current?.(pinchedZoom(start.zoom, start.distance, distance(), 1, zoomMaxRef.current));
    };
    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      start = null; // 한 손가락이 떨어지면 끝. 남은 손가락으로 이어서 움직이지 않는다
    };
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    return () => {
      host.style.touchAction = previousTouchAction;
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
    };
  }, []);

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
        const track = s.getVideoTracks()[0];
        const zoomCaps = (track?.getCapabilities?.() as ZoomCapabilities | undefined)?.zoom;
        hardwareRef.current = !!zoomCaps;
        setHardwareZoom(!!zoomCaps);
        onCapability.current?.({ hardware: !!zoomCaps, max: zoomCaps?.max ?? 1 });
        // 새 스트림은 1배로 열리므로 지금 배율을 다시 맞춘다 (끊겼다 다시 열린 경우)
        if (zoomCaps && zoomRef.current > 1) applyHardwareZoom(zoomRef.current);
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
      // 저장 규칙대로 가운데 정사각만, 최종 크기(장변 1440 이하)로 곧바로 그린다. 원본(안드로이드는 4000px 넘게도 준다)을
      // 통째로 그리고 인코딩하면 셔터 뒤에 오래 멈춘다. 카메라 자체 줌이면 프레임이 이미 확대돼 있어 오리지 않는다.
      const digital = hardwareRef.current || mode !== 'photo' ? 1 : zoom;
      const { sx, sy, side, outSide } = squareCapture(v.videoWidth, v.videoHeight, digital, PHOTO_SIDE);
      const blob = await encodeJpeg(drawSquare(v, sx, sy, side, outSide), JPEG_QUALITY);
      return { uri: URL.createObjectURL(blob), width: outSide, height: outSide };
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

  // 카메라 자체 줌이면 프레임이 이미 확대돼 있다. 디지털 줌은 사진에서만 미리보기를 키운다
  // (녹화는 트랙 원본을 그대로 담으므로 영상 미리보기에 디지털 줌을 보이면 실제 녹화와 달라 보인다)
  const previewZoom = !hardwareZoom && mode === 'photo' && zoom > 1 ? zoom : 1;
  return (
    <video
      ref={video}
      autoPlay
      muted
      playsInline
      style={{ ...style, display: 'block', objectFit: 'cover', transform: previewZoom > 1 ? `scale(${previewZoom})` : undefined }}
    />
  );
}
