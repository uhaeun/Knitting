import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useInstall } from '@/features/pwa/useInstall';
import { showAlert } from '@/shared/lib/dialog';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { color, fontSize, fontWeight, radius, space } from '@/shared/ui/tokens';

const IOS_STEPS = [
  '아래 가운데 공유 버튼을 누르세요',
  '목록을 내려 "홈 화면에 추가"를 누르세요',
  '오른쪽 위 "추가"를 누르면 끝이에요',
] as const;

const ANDROID_STEPS = [
  '"앱 설치"를 누르세요',
  '"설치"를 한 번 더 누르면 끝이에요',
] as const;

type Props = { visible: boolean; onClose: () => void };

/** 홈 화면에 추가하는 법. 안드로이드는 버튼 한 번, iPhone은 세 단계를 따라 한다. */
export function InstallGuide({ visible, onClose }: Props) {
  const { platform, state, install } = useInstall();
  const steps = platform === 'ios' ? IOS_STEPS : ANDROID_STEPS;

  const onInstall = () => {
    void install().then((outcome) => {
      if (outcome === 'accepted') onClose();
    });
  };

  return (
    <BottomSheet visible={visible} title="앱처럼 쓰기" onClose={onClose}>
      <View style={styles.block}>
        <Text style={styles.lead}>
          홈 화면에 추가하면 주소창 없이 전체 화면으로 열려요. 설치 심사도 용량도 없어요.
        </Text>

        {state === 'installed' ? (
          <Text style={styles.done}>이미 홈 화면 앱으로 열고 있어요.</Text>
        ) : (
          <View style={styles.steps}>
            {steps.map((text, i) => (
              <View key={text} style={styles.step}>
                <View style={styles.num}>
                  <Text style={styles.numText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{text}</Text>
              </View>
            ))}
          </View>
        )}

        {state !== 'installed' ? (
          <Text style={styles.note}>
            추가한 뒤에는 홈 화면의 닛팅 아이콘으로 열어 주세요. 그러면 이 안내는 사라져요.
          </Text>
        ) : null}

        {platform === 'ios' ? (
          <Text style={styles.note}>
            iPhone은 Safari에서만 추가할 수 있어요. 크롬으로 보고 있다면 Safari로 이 주소를 열어 주세요.
          </Text>
        ) : null}

        {state === 'prompt' ? <Button label="앱 설치" large onPress={onInstall} /> : null}
        <Button label={state === 'installed' ? '닫기' : '나중에'} variant="secondary" large onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

/** 목록 위에 뜨는 한 줄 안내. 누르면 위 시트가 열리고, ×를 누르면 다시 뜨지 않는다. */
export function InstallBanner({ onOpen }: { onOpen: () => void }) {
  const { showBanner, dismiss, platform } = useInstall();
  if (!showBanner) return null;
  return (
    <View style={styles.banner}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.bannerMain}>
        <Text style={styles.bannerTitle}>홈 화면에 추가하기</Text>
        <Text style={styles.bannerText}>
          {platform === 'ios' ? '앱처럼 열리고, 나중에 알림도 받을 수 있어요' : '앱처럼 열려요. 한 번만 누르면 돼요'}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="안내 닫기" onPress={dismiss} style={styles.bannerClose}>
        <Text style={styles.bannerCloseText}>✕</Text>
      </Pressable>
    </View>
  );
}

/** 설정 화면에서 다시 열기 위한 도우미 */
export function useInstallGuideEntry() {
  const { state } = useInstall();
  const label = state === 'installed' ? '이미 홈 화면 앱이에요' : '홈 화면에 추가하기';
  const onPress = (open: () => void) => () => {
    if (state === 'installed') showAlert('이미 홈 화면 앱이에요', '주소창 없이 열고 있어요.');
    else open();
  };
  return { label, onPress };
}

const styles = StyleSheet.create({
  block: { gap: space.lg },
  lead: { fontSize: fontSize.body, color: color.text, lineHeight: fontSize.body * 1.5 },
  steps: { gap: space.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  num: { width: 26, height: 26, borderRadius: radius.pill, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  numText: { color: color.onDark, fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  stepText: { flex: 1, fontSize: fontSize.body, color: color.text },
  note: { fontSize: fontSize.caption, color: color.textMuted, lineHeight: fontSize.caption * 1.5 },
  done: { fontSize: fontSize.body, color: color.accent, fontWeight: fontWeight.semibold },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    marginHorizontal: space.xl, marginBottom: space.md, padding: space.md,
    borderRadius: radius.card, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border,
  },
  bannerMain: { flex: 1, gap: 2 },
  bannerTitle: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: color.text },
  bannerText: { fontSize: fontSize.caption, color: color.textMuted },
  bannerClose: { padding: space.sm },
  bannerCloseText: { fontSize: fontSize.body, color: color.textMuted },
});
