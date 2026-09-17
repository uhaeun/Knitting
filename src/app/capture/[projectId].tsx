import { useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CameraView } from '@/features/capture/Camera';
import { GhostToggle } from '@/features/capture/GhostToggle';
import { GridOverlay } from '@/features/capture/GridOverlay';
import { useLatestPost, useSavePost } from '@/features/capture/queries';
import { postPhotoUri } from '@/features/capture/repository';
import { useCaptureSettings } from '@/features/capture/store';
import { useProject } from '@/features/project/queries';
import { daysSince, formatMonthDay } from '@/shared/lib/dates';
import { showAlert } from '@/shared/lib/dialog';
import { Button } from '@/shared/ui/Button';
import { useSquareSide } from '@/shared/ui/layout';
import { color, fontSize, fontWeight, ghostOpacity, radius, size, space } from '@/shared/ui/tokens';

type Shot = { uri: string; width: number; height: number };

/** 시안 1c (고스트) / 1d (첫 장). 이 앱의 핵심 화면. */
export default function CaptureScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const screenW = useSquareSide(size.webCaptureChrome); // 정사각 촬영 영역 한 변 (앱은 화면 너비)
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const project = useProject(projectId);
  const latest = useLatestPost(projectId);
  const save = useSavePost(projectId);
  const { ghost, grid, setGhost, toggleGrid } = useCaptureSettings();

  const isFirst = latest.isSuccess && latest.data === null;
  const ghostUri = latest.data ? postPhotoUri(latest.data) : null;
  const title = project.data
    ? `${project.data.name} · ${isFirst ? '첫 장' : `${daysSince(project.data.started_at)}일째`}`
    : '';

  const persist = (shot: Shot) => {
    save.mutate(
      { sourceUri: shot.uri, width: shot.width, height: shot.height },
      {
        onSuccess: () => router.back(),
        onError: (e) =>
          showAlert('저장하지 못했어요', e instanceof Error ? e.message : String(e), [
            { text: '다시 시도', onPress: () => persist(shot) },
            { text: '닫기', style: 'cancel' },
          ]),
      },
    );
  };

  const shoot = async () => {
    if (!camera.current || !ready || busy) return;
    setBusy(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 1, exif: false, shutterSound: false });
      persist({ uri: pic.uri, width: pic.width, height: pic.height });
    } catch (e) {
      showAlert('촬영하지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickFromAlbum = async () => {
    if (busy) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
    const a = res.assets?.[0];
    if (res.canceled || !a) return;
    persist({ uri: a.uri, width: a.width, height: a.height });
  };

  // --- 권한 ---
  if (!permission) return <View style={styles.root} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.permission}>
          <Text style={styles.permissionTitle}>카메라를 쓸 수 없어요</Text>
          <Text style={styles.permissionBody}>
            {permission.canAskAgain
              ? '편물을 같은 각도로 찍으려면 카메라 권한이 필요합니다.'
              : Platform.OS === 'web'
                ? '브라우저 주소창의 카메라 권한을 허용한 뒤 다시 시도해 주세요. 카메라 없이 앨범에서 가져올 수도 있어요.'
                : '설정에서 Knitting의 카메라 권한을 켜 주세요.'}
          </Text>
          <Button
            label={permission.canAskAgain ? '권한 허용' : Platform.OS === 'web' ? '다시 시도' : '설정 열기'}
            onPress={() =>
              permission.canAskAgain || Platform.OS === 'web' ? requestPermission() : Linking.openSettings()
            }
          />
          {Platform.OS === 'web' ? <Button label="앨범에서 가져오기" variant="secondary" onPress={pickFromAlbum} /> : null}
          <Button label="닫기" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const saving = save.isPending;
  const previewH = (screenW * 4) / 3; // iOS 기본 4:3 미리보기를 정사각에 가운데로 넣고 위아래를 자른다

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} style={styles.tap}>
          <View style={[styles.x, styles.xA]} />
          <View style={[styles.x, styles.xB]} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.tap} />
      </View>

      <View style={[styles.square, { width: screenW, height: screenW }]}>
        <CameraView
          ref={camera}
          facing="back"
          animateShutter={false}
          onCameraReady={() => setReady(true)}
          style={{ width: screenW, height: previewH, marginTop: (screenW - previewH) / 2 }}
        />
        {ghostUri && ghost !== 'off' ? (
          <Image
            source={{ uri: ghostUri }}
            contentFit="cover"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: ghostOpacity[ghost] }]}
          />
        ) : null}
        {ghostUri && latest.data ? (
          <View pointerEvents="none" style={styles.ghostBadge}>
            <Text style={styles.ghostBadgeText}>직전 사진 · {formatMonthDay(latest.data.taken_at)}</Text>
          </View>
        ) : null}
        {grid ? <GridOverlay /> : null}
        {saving ? (
          <View style={styles.savingOverlay}>
            <ActivityIndicator color={color.onDark} />
            <Text style={styles.savingText}>저장 중</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottom}>
        {isFirst ? (
          <View style={styles.hint}>
            <View style={styles.hintBar} />
            <View style={styles.hintBody}>
              <Text style={styles.hintText}>편물을 화면 중앙에, 배경은 단색으로 두세요.</Text>
              <Text style={styles.hintSub}>이 첫 장이 앞으로의 기준 각도가 됩니다.</Text>
            </View>
          </View>
        ) : (
          <View style={styles.controls}>
            <Text style={styles.controlLabel}>겹치기</Text>
            <GhostToggle value={ghost} onChange={setGhost} />
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: grid }}
              accessibilityLabel="격자"
              onPress={toggleGrid}
              style={[styles.gridButton, grid && styles.gridButtonOn]}
            >
              <View style={styles.gridIcon}>
                {[0, 1, 2].map((r) => (
                  <View key={r} style={styles.gridIconRow}>
                    {[0, 1, 2].map((c) => (
                      <View key={c} style={[styles.gridIconCell, grid && styles.gridIconCellOn]} />
                    ))}
                  </View>
                ))}
              </View>
            </Pressable>
          </View>
        )}

        <View style={styles.shutterRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="앨범에서 가져오기" onPress={pickFromAlbum} style={styles.album}>
            <Text style={styles.albumText}>앨범</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="촬영"
            onPress={shoot}
            disabled={!ready || busy || saving}
            style={({ pressed }) => [styles.shutter, (pressed || busy) && styles.shutterPressed, !ready && styles.shutterDisabled]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.cancel}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.cameraBg },
  topBar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
  tap: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  x: { position: 'absolute', width: 16, height: 2, backgroundColor: color.onDark },
  xA: { transform: [{ rotate: '45deg' }] },
  xB: { transform: [{ rotate: '-45deg' }] },
  title: { flex: 1, textAlign: 'center', fontSize: fontSize.label, fontWeight: fontWeight.semibold, color: color.onDark },

  square: { alignSelf: 'center', overflow: 'hidden', backgroundColor: color.cameraBg },
  ghostBadge: {
    position: 'absolute', left: space.md, bottom: space.md,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: color.overlay,
  },
  ghostBadgeText: { fontSize: fontSize.micro, color: color.onDark, fontVariant: ['tabular-nums'] },
  savingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: color.overlay },
  savingText: { fontSize: fontSize.caption, color: color.onDark },

  bottom: { flex: 1, justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.xl },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  controlLabel: { width: 52, fontSize: fontSize.caption, color: color.onDarkMuted },
  gridButton: {
    marginLeft: 'auto', width: size.tap, height: size.tap,
    borderWidth: size.hairline, borderColor: color.onDarkBorder, borderRadius: radius.button,
    alignItems: 'center', justifyContent: 'center',
  },
  gridButtonOn: { backgroundColor: color.onDark },
  gridIcon: { width: 18, height: 18, gap: 1 },
  gridIconRow: { flex: 1, flexDirection: 'row', gap: 1 },
  gridIconCell: { flex: 1, borderWidth: 1, borderColor: color.onDarkSecondary },
  gridIconCellOn: { borderColor: color.cameraBg },

  hint: { flexDirection: 'row', gap: space.md, borderWidth: size.hairline, borderColor: color.onDarkBorder, borderRadius: radius.button, padding: space.md },
  hintBar: { width: 3, backgroundColor: color.onDarkHint },
  hintBody: { flex: 1, gap: space.xs },
  hintText: { fontSize: fontSize.label, lineHeight: fontSize.label * 1.55, color: color.onDark },
  hintSub: { fontSize: fontSize.caption, color: color.onDarkMuted },

  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.xl },
  album: {
    width: size.albumButton, height: size.albumButton, borderRadius: radius.photo,
    borderWidth: size.hairline, borderColor: color.onDarkBorder, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: space.xs,
  },
  albumText: { fontSize: fontSize.micro, color: color.onDark },
  shutter: { width: size.shutter, height: size.shutter, borderRadius: radius.pill, borderWidth: 3, borderColor: color.onDark, padding: 5 },
  shutterInner: { flex: 1, borderRadius: radius.pill, backgroundColor: color.accent },
  shutterPressed: { opacity: 0.7 },
  shutterDisabled: { opacity: 0.4 },
  cancel: { width: size.albumButton, height: size.albumButton, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: fontSize.label, color: color.onDarkSecondary },

  permission: { flex: 1, justifyContent: 'center', gap: space.lg, paddingHorizontal: space.xxxl },
  permissionTitle: { fontSize: fontSize.heading, fontWeight: fontWeight.semibold, color: color.onDark },
  permissionBody: { fontSize: fontSize.label, lineHeight: fontSize.label * 1.55, color: color.onDarkMuted },
});
