import { requireNativeModule, type EventSubscription, type NativeModule } from 'expo-modules-core';

import type { EncodeOptions, EncodeProgress, EncodeResult } from './src/VideoEncoder.types';

export type { EncodeOptions, EncodeProgress, EncodeResult };

type Events = { onProgress: (e: EncodeProgress) => void };

declare class VideoEncoderNative extends NativeModule<Events> {
  /** frames: 파일 절대 경로 배열 (file:// 허용). 같은 경로를 반복하면 그 장을 여러 프레임 유지한다 */
  encode(frames: string[], options: EncodeOptions): Promise<EncodeResult>;
}

const native = requireNativeModule<VideoEncoderNative>('VideoEncoder');

export function encode(frames: string[], options: EncodeOptions): Promise<EncodeResult> {
  return native.encode(frames, options);
}

export function addProgressListener(listener: (e: EncodeProgress) => void): EventSubscription {
  return native.addListener('onProgress', listener);
}
