import { LocalNotifications } from '@capacitor/local-notifications';
import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_REMINDER,
  DEFAULT_RULE,
  nextOccurrences,
  REMINDER_BODY,
  REMINDER_TITLE,
  type ReminderRule,
  type ReminderTime,
} from '@/features/reminder/reminder';
import { isNativeApp } from '@/shared/lib/platform';

const KEY = 'knitting.reminder.v2';
/** 예약 알림 id 범위. 이 범위만 지우고 다시 채운다 */
const ID_BASE = 1000;

export type ReminderSettings = { on: boolean; time: ReminderTime; rule: ReminderRule };

function load(): ReminderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ReminderSettings;
  } catch {
    // 읽지 못하면 꺼진 상태로
  }
  return { on: false, time: DEFAULT_REMINDER, rule: DEFAULT_RULE };
}

function store(v: ReminderSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // 저장 못 해도 예약은 기기에 남는다
  }
}

async function clearScheduled() {
  const { notifications } = await LocalNotifications.getPending();
  const ours = notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + 1000);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
}

/** 다음 알림들을 날짜로 예약한다. 반복 규칙(요일·며칠마다)을 기기 기능만으로는 못 표현해서 앞으로 48번을 미리 넣는다 */
async function scheduleAhead(s: ReminderSettings) {
  await clearScheduled();
  if (!s.on) return;
  const times = nextOccurrences(s.rule, s.time, new Date());
  if (!times.length) return;
  await LocalNotifications.schedule({
    notifications: times.map((at, i) => ({
      id: ID_BASE + i,
      title: REMINDER_TITLE,
      body: REMINDER_BODY,
      schedule: { at, allowWhileIdle: true },
      // 안드로이드 12+에서 '정확한 알람'을 요구하면 설정 화면으로 튕겨 간다. 촬영 알림은 몇 분 늦어도 되니 대략으로 예약한다
      isExactNotification: false,
    })),
  });
}

/**
 * 촬영 알림. 앱에서만 된다 — 기기가 스스로 시간을 지켜 알린다 (서버 없음).
 * 반복은 매일 / 요일 / 며칠마다. 앱을 열 때마다 앞으로의 예약을 다시 채운다.
 */
export function useReminder() {
  const [settings, setSettings] = useState<ReminderSettings>(load);
  const available = isNativeApp();

  // 앱을 열 때 예약을 채워 둔다 (48번을 다 쓰기 전에 다시 연다고 본다)
  useEffect(() => {
    if (!available || !settings.on) return;
    void scheduleAhead(settings).catch(() => {});
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  /** 설정을 바꾸고 예약을 다시 한다. 켤 때는 권한부터 묻는다 */
  const update = useCallback(async (patch: Partial<ReminderSettings>) => {
    const next = { ...settings, ...patch };
    if (next.on) {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') throw new Error('알림 권한이 꺼져 있어요. 기기 설정에서 닛팅 알림을 허용해 주세요.');
    }
    await scheduleAhead(next);
    store(next);
    setSettings(next);
  }, [settings]);

  return { available, ...settings, update };
}
