import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { MakeVideoState } from '@/features/media/useMakeVideo';
import { showAlert } from '@/shared/lib/dialog';
import { canShareFiles } from '@/shared/lib/saveFile';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { color, fontSize, fontWeight, radius, space } from '@/shared/ui/tokens';

type Props = {
  state: MakeVideoState;
  recordCount: number;
  estimateSec: number;
  onClose: () => void;
  onRetry: () => void;
  onSave: () => Promise<void>;
};

const guard = (title: string, fn: () => Promise<void>) => () =>
  fn().catch((e: unknown) => showAlert(title, e instanceof Error ? e.message : String(e)));


/** 영상 만들기 진행·결과 시트. 인코딩 중에는 닫히지 않는다. */
export function MakeVideoSheet({ state, recordCount, estimateSec, onClose, onRetry, onSave }: Props) {
  const encoding = state.status === 'encoding';
  const share = canShareFiles();
  return (
    <BottomSheet visible={state.status !== 'idle'} title="영상 만들기" onClose={encoding ? () => {} : onClose}>
      {state.status === 'encoding' ? (
        <View style={styles.block}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%` }]} />
          </View>
          <View style={styles.row}>
            <ActivityIndicator color={color.accent} />
            <Text style={styles.muted}>
              기록 {recordCount}개 → 약 {estimateSec.toFixed(1)}초 · {Math.round(state.progress * 100)}%
            </Text>
          </View>
        </View>
      ) : null}

      {state.status === 'done' ? (
        <View style={styles.block}>
          <Text style={styles.headline}>영상이 준비됐어요</Text>
          <Text style={styles.muted}>
            {(state.result.durationMs / 1000).toFixed(1)}초 · {state.result.frameCount}프레임 ·{' '}
            {(state.result.bytes / 1_000_000).toFixed(1)}MB
          </Text>
          <Button label={share ? '사진첩에 저장' : '파일로 저장'} large onPress={guard('저장하지 못했어요', onSave)} />
          {share ? <Text style={styles.muted}>열리는 공유 창에서 "비디오 저장"을 누르세요. 인스타그램 등으로 바로 보낼 수도 있어요.</Text> : null}
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.block}>
          <Text style={styles.headline}>만들지 못했어요</Text>
          <Text style={styles.muted}>{state.message}</Text>
          <Button label="다시 시도" large onPress={onRetry} />
          <Button label="닫기" variant="secondary" large onPress={onClose} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: color.border, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: color.accent },
  headline: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  muted: { fontSize: fontSize.caption, color: color.textMuted, lineHeight: fontSize.caption * 1.5 },
});
