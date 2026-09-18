import { LocalNotifications } from '@capacitor/local-notifications';
import { useCallback, useState } from 'react';

import { DEFAULT_REMINDER, REMINDER_BODY, REMINDER_TITLE, type ReminderTime } from '@/features/reminder/reminder';
import { isNativeApp } from '@/shared/lib/platform';

const KEY = 'knitting.reminder';
const NOTIFICATION_ID = 1;

type Stored = { on: boolean; time: ReminderTime };

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // 읽지 못하면 꺼진 상태로
  }
  return { on: false, time: DEFAULT_REMINDER };
}

function store(v: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // 저장 못 해도 예약은 기기에 남는다
  }
}

/**
 * 촬영 알림. 앱에서만 된다 — 기기가 스스로 시간을 지켜 알린다 (서버 없음).
 * 켜면 권한을 묻고, 매일 같은 시각에 한 번 알린다. 끄면 예약을 지운다.
 */
export function useReminder() {
  const [state, setState] = useState<Stored>(load);
  const available = isNativeApp();

  const schedule = useCallback(async (time: ReminderTime) => {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') throw new Error('알림 권한이 꺼져 있어요. 기기 설정에서 닛팅 알림을 허용해 주세요.');
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: REMINDER_TITLE,
          body: REMINDER_BODY,
          schedule: { on: { hour: time.hour, minute: time.minute }, repeats: true, allowWhileIdle: true },
        },
      ],
    });
  }, []);

  const turnOn = useCallback(async (time: ReminderTime = state.time) => {
    await schedule(time);
    const next = { on: true, time };
    store(next);
    setState(next);
  }, [schedule, state.time]);

  const turnOff = useCallback(async () => {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
    const next = { ...state, on: false };
    store(next);
    setState(next);
  }, [state]);

  return { available, on: state.on, time: state.time, turnOn, turnOff };
}
