import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, fontSize, fontWeight, radius, size, space } from '@/shared/ui/tokens';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** 아래에서 올라오는 시트. 배경을 누르면 닫힌다. 라이브러리 없이 Modal로 처리. */
export function BottomSheet({ visible, title, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.sheet, Platform.OS === 'web' && styles.webSheet, { paddingBottom: Math.max(insets.bottom, space.xxl) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.overlay },
  sheet: {
    backgroundColor: color.surface,
    borderTopWidth: size.hairline,
    borderColor: color.border,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    gap: space.lg,
  },
  // 웹: 앱 칸과 같은 폭으로 가운데에
  webSheet: { width: '100%', maxWidth: size.webColumn, alignSelf: 'center' },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
  },
  title: { fontSize: fontSize.heading, fontWeight: fontWeight.semibold, color: color.text },
});
