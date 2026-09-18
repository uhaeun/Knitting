/** 홈 화면 앱(PWA) 설치 상태. 순수 함수 부분은 브라우저 의존이 없어 테스트할 수 있다. */

export type Platform = 'ios' | 'android' | 'desktop';
/** installed: 이미 홈 화면 앱으로 열림 · prompt: 버튼 한 번으로 설치(안드로이드) · guide: 손으로 따라 해야 함(iPhone) · none: 안내할 게 없음 */
export type InstallState = 'installed' | 'prompt' | 'guide' | 'none';

export function platformOf(userAgent: string): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS는 데스크톱처럼 보이므로 터치 지원을 함께 본다 (호출하는 쪽에서 maxTouchPoints를 붙여 준다)
  if (/Macintosh.*Touch/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

/** 무엇을 보여 줄지. standalone은 홈 화면 앱으로 열렸는지, canPrompt는 브라우저가 설치 버튼을 줬는지 */
export function installStateOf(input: {
  platform: Platform;
  standalone: boolean;
  canPrompt: boolean;
}): InstallState {
  if (input.standalone) return 'installed';
  if (input.canPrompt) return 'prompt';
  if (input.platform === 'ios') return 'guide';
  return 'none';
}

/** 홈 화면 앱으로 열렸는가. iOS Safari는 navigator.standalone, 나머지는 display-mode */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const touchMac = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return platformOf(touchMac ? `${navigator.userAgent} Touch` : navigator.userAgent);
}
