import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { buttonLabel, nextStep, TOUR_LAST, TOUR_STEPS } from '@/features/onboarding/tour';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { StitchRow } from '@/shared/ui/StitchRow';
import { color, fontSize, fontWeight, radius, space } from '@/shared/ui/tokens';

type Props = { visible: boolean; onDone: () => void };

/** 가입 직후 한 번 보는 사용법. 세 장이고 건너뛸 수 있다. */
export function TourSheet({ visible, onDone }: Props) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  if (!current) return null;

  const advance = () => (step === TOUR_LAST ? onDone() : setStep(nextStep(step)));

  return (
    <BottomSheet visible={visible} title="닛팅 쓰는 법" onClose={onDone}>
      <View style={styles.block}>
        <View style={styles.art}>
          <Art kind={current.art} />
        </View>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>

        <View style={styles.dots}>
          {TOUR_STEPS.map((s, i) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}번째 안내`}
              onPress={() => setStep(i)}
              style={[styles.dot, i === step && styles.dotOn]}
            />
          ))}
        </View>

        <Button label={buttonLabel(step)} large onPress={advance} />
        {step === TOUR_LAST ? null : (
          <Pressable accessibilityRole="button" onPress={onDone} style={styles.skip}>
            <Text style={styles.skipText}>건너뛰기</Text>
          </Pressable>
        )}
      </View>
    </BottomSheet>
  );
}

/** 단계별 그림. 사진 없이 앱 안 부품으로만 그린다 */
function Art({ kind }: { kind: 'ghost' | 'stitches' | 'result' }) {
  if (kind === 'stitches') {
    return (
      <View style={styles.center}>
        <StitchRow total={9} index={5} unit={22} perRow={9} />
      </View>
    );
  }
  if (kind === 'result') {
    return (
      <View style={styles.resultRow}>
        <View style={styles.panel} />
        <View style={styles.panel} />
        <View style={[styles.panel, styles.panelAccent]} />
      </View>
    );
  }
  // ghost: 직전 사진이 옅게 겹치는 모습
  return (
    <View style={styles.center}>
      <View style={styles.frame}>
        <View style={[styles.blob, styles.blobGhost]} />
        <View style={styles.blob} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  art: { height: 132, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  title: { fontSize: fontSize.heading, fontWeight: fontWeight.semibold, color: color.text },
  body: { fontSize: fontSize.body, color: color.textMuted, lineHeight: fontSize.body * 1.5 },
  dots: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.tickInactive },
  dotOn: { backgroundColor: color.accent, width: 20 },
  skip: { alignItems: 'center', paddingVertical: space.sm },
  skipText: { fontSize: fontSize.caption, color: color.textMuted },
  frame: {
    width: 116, height: 116, borderRadius: radius.photo, borderWidth: 1,
    borderColor: color.border, backgroundColor: color.surface, justifyContent: 'center', alignItems: 'center',
  },
  blob: { position: 'absolute', width: 58, height: 58, borderRadius: radius.pill, backgroundColor: color.accent },
  blobGhost: { opacity: 0.28, transform: [{ translateX: -14 }, { translateY: 8 }, { scale: 0.9 }] },
  resultRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  panel: { width: 36, height: 116, borderRadius: 4, backgroundColor: color.border },
  panelAccent: { backgroundColor: color.accent },
});
