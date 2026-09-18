import { useCallback, useState } from 'react';

const KEY = 'knitting.tourSeen';

/** 첫 사용 안내를 이 기기에서 봤는지. 한 번 보면 다시 뜨지 않는다. */
export function useTour() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return true; // 기억할 수 없으면 띄우지 않는다 (열 때마다 뜨면 성가시다)
    }
  });

  const finish = useCallback(() => {
    setSeen(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // 저장 못 해도 이번 세션에서는 닫힌다
    }
  }, []);

  const reset = useCallback(() => {
    setSeen(false);
    try {
      localStorage.removeItem(KEY);
    } catch {
      // 무시
    }
  }, []);

  return { seen, finish, reset };
}
