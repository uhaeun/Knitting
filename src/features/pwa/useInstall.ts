import { useCallback, useEffect, useState } from 'react';

import { currentPlatform, installStateOf, isStandalone, type InstallState, type Platform } from '@/features/pwa/install';

/** 안드로이드·데스크톱 Chrome이 주는 설치 프롬프트 */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const DISMISS_KEY = 'knitting.installGuideDismissed';

/**
 * 홈 화면 앱 설치 상태와 안내 표시 여부.
 * - 이미 설치했으면 아무것도 보여 주지 않는다
 * - 안드로이드는 브라우저 설치 버튼을 그대로 쓴다
 * - iPhone은 손으로 따라 하는 안내를 띄운다 (한 번 닫으면 다시 뜨지 않는다)
 */
export function useInstall() {
  const [platform] = useState<Platform>(() => currentPlatform());
  const [standalone, setStandalone] = useState(() => isStandalone());
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false; // 시크릿 모드 등에서 읽기가 막히면 안내는 보여 준다
    }
  });

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 배너 대신 우리 버튼으로 띄운다
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // 홈 화면에서 열면 display-mode가 바뀐다
    const media = window.matchMedia?.('(display-mode: standalone)');
    const onMode = () => setStandalone(isStandalone());
    media?.addEventListener?.('change', onMode);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media?.removeEventListener?.('change', onMode);
    };
  }, []);

  const state: InstallState = installStateOf({ platform, standalone, canPrompt: !!promptEvent });

  const install = useCallback(async () => {
    if (!promptEvent) return 'unavailable' as const;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setPromptEvent(null);
    return outcome;
  }, [promptEvent]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // 저장 못 해도 이번 화면에서는 닫힌다
    }
  }, []);

  const reset = useCallback(() => {
    setDismissed(false);
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      // 무시
    }
  }, []);

  return { platform, state, install, dismiss, reset, showBanner: state !== 'installed' && state !== 'none' && !dismissed };
}
