import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { orderButtons, useDialogs } from '@/shared/lib/dialog';
import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

/** 앱 전체에 하나. showAlert로 쌓인 대화상자를 하나씩 아래 시트로 보여 준다 */
export function DialogHost() {
  const current = useDialogs((s) => s.queue[0]);
  const close = useDialogs((s) => s.close);
  const insets = useSafeAreaInsets();
  if (!current) return null;

  const { actions, cancel } = orderButtons(current.buttons);
  const run = (onPress?: () => void) => {
    close(current.id);
    onPress?.();
  };
  // 배경을 누르면 취소와 같다. 취소가 없는 안내는 확인과 같다
  const dismiss = () => run(cancel?.onPress ?? (actions.length === 1 ? actions[0]?.onPress : undefined));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.fill}>
        <Pressable style={styles.overlay} onPress={dismiss} accessibilityLabel="닫기" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.xl) }]} accessibilityRole="alert">
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={styles.buttons}>
            {actions.map((b, i) => {
              const danger = b.style === 'destructive';
              const primary = !danger && i === 0 && actions.length === 1;
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  accessibilityRole="button"
                  onPress={() => run(b.onPress)}
                  style={({ pressed }) => [styles.button, primary && styles.primary, danger && styles.dangerButton, pressed && styles.pressed]}
                >
                  <Text style={[styles.buttonText, primary && styles.primaryText, danger && styles.dangerText]}>{b.text ?? '확인'}</Text>
                </Pressable>
              );
            })}
            {cancel ? (
              <Pressable accessibilityRole="button" onPress={() => run(cancel.onPress)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
                <Text style={styles.cancelText}>{cancel.text ?? '취소'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.overlay },
  sheet: {
    backgroundColor: color.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xl, paddingTop: space.xl, gap: space.sm,
    width: '100%', maxWidth: size.webColumn, alignSelf: 'center',
  },
  title: { fontSize: fontSize.heading, fontWeight: fontWeight.semibold, color: color.text },
  message: { fontSize: fontSize.body, color: color.textMuted, lineHeight: fontSize.body * 1.5 },
  buttons: { gap: space.sm, marginTop: space.md },
  button: {
    minHeight: size.tap + 4, borderRadius: radius.button, borderWidth: size.hairline, borderColor: color.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface,
  },
  primary: { backgroundColor: color.accent, borderColor: color.accent },
  dangerButton: { borderColor: color.danger },
  pressed: { opacity: 0.7 },
  buttonText: { fontSize: fontSize.body, color: color.text, fontWeight: fontWeight.semibold },
  primaryText: { color: color.onDark },
  dangerText: { color: color.danger },
  cancel: { minHeight: size.tap, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: fontSize.body, color: color.textMuted },
});
