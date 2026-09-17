import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { color, fontSize, space } from '@/shared/ui/tokens';

/**
 * 웹 전용 카메라 뷰. expo-camera의 웹 구현은 해상도를 지정하지 않아 브라우저 기본값(보통 640×480)을 받는다.
 * 그러면 정사각 크롭 결과가 480px에 그쳐 앱(1440px)과 품질이 달라지므로, 직접 getUserMedia로 높은 해상도를 요청한다.
 * 촬영 화면이 쓰는 표면(ref.takePictureAsync, onCameraReady, style)만 맞춘다.
 */

type Shot = { uri: string; width: number; height: number };
export type WebCameraHandle = { takePictureAsync: (options?: object) => Promise<Shot> };

type Props = {
  ref?: Ref<WebCameraHandle>;
  facing?: 'back' | 'front';
  onCameraReady?: () => void;
  style?: { width?: number; height?: number; marginTop?: number };
  animateShutter?: boolean;
};

/** 짧은 변이 1440 이상 나오도록 넉넉히. 브라우저가 가능한 가장 가까운 값을 고른다 */
const IDEAL_SIDE = 2560;
const JPEG_QUALITY = 0.95;

export function CameraView({ ref, facing = 'back', onCameraReady, style }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // 화면이 매 렌더마다 새 콜백을 넘기므로 ref로 받아 스트림을 다시 열지 않는다
  const onReady = useRef(onCameraReady);
  useEffect(() => {
    onReady.current = onCameraReady;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
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
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        await v.play();
        onReady.current?.();
      })
      .catch((e: unknown) => {
        // 권한은 있는데 다른 앱이 카메라를 쓰는 중(NotReadableError) 등. 셔터는 비활성인 채로 두고 이유를 보여 준다
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [facing]);

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
