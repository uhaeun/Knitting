export type EncodeOptions = {
  /** 출력 파일 절대 경로 (file:// 없이). 기존 파일은 덮어쓴다 */
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  /** bits per second. 기본 6_000_000 */
  bitrate?: number;
};

export type EncodeResult = {
  uri: string;
  frameCount: number;
  durationMs: number;
  bytes: number;
};

export type EncodeProgress = {
  /** 0..1 */
  progress: number;
  frame: number;
  total: number;
};
