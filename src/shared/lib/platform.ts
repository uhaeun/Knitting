/**
 * 웹앱으로 여는가, 감싼 앱(하이브리드)으로 여는가.
 * 앱에서는 카메라·사진첩 저장·알림을 네이티브로 쓴다. 웹에서는 지금까지의 방식을 그대로 쓴다.
 */
import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false; // 웹 번들에서 플러그인이 없을 때
  }
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  try {
    const p = Capacitor.getPlatform();
    return p === 'ios' || p === 'android' ? p : 'web';
  } catch {
    return 'web';
  }
}
