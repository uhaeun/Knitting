import { useState } from 'react';

import { color, fontSize, space } from '@/shared/ui/tokens';

type Props = { uri: string; poster?: string; label?: string };

/**
 * 영상 기록 재생. 소리 없이 자동 반복. 실패하면 대표 사진과 안내 문구.
 * 부모 영역을 꽉 채운다. uri가 바뀌면 부모가 key로 새로 만든다 (실패 상태 초기화).
 */
export function VideoPlayer({ uri, poster, label }: Props) {
  const [failed, setFailed] = useState(false);
  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' } as const;

  if (failed) {
    return (
      <div style={fill}>
        {poster ? <img src={poster} alt="" style={{ ...fill, objectFit: 'cover' }} /> : null}
        <div
          role="status"
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, padding: space.md, // 위쪽: 아래 왼쪽의 ▶ 배지와 겹치지 않게
            background: color.photoLabelBg, color: color.onDark, fontSize: fontSize.caption, textAlign: 'center',
          }}
        >
          영상을 불러오지 못했어요
        </div>
      </div>
    );
  }

  return (
    <video
      src={uri}
      poster={poster}
      aria-label={label}
      muted
      loop
      playsInline
      autoPlay
      preload="metadata"
      onError={() => setFailed(true)}
      style={{ ...fill, objectFit: 'cover', display: 'block' }}
    />
  );
}
