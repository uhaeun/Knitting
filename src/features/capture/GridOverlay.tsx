import { StyleSheet, View } from 'react-native';

import { color } from '@/shared/ui/tokens';

/** 3×3 격자. 터치를 가로채지 않는다. */
export function GridOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.v, { left: '33.333%' }]} />
      <View style={[styles.v, { left: '66.667%' }]} />
      <View style={[styles.h, { top: '33.333%' }]} />
      <View style={[styles.h, { top: '66.667%' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  v: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: color.gridLine },
  h: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: color.gridLine },
});
