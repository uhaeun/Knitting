import { friendlyMessage, orderButtons } from '@/shared/lib/dialog';

describe('friendlyMessage', () => {
  it('흔한 영어 오류를 한국어로', () => {
    expect(friendlyMessage('TypeError: Failed to fetch')).toBe('인터넷 연결을 확인해 주세요.');
    expect(friendlyMessage('Load failed')).toBe('인터넷 연결을 확인해 주세요.');
    expect(friendlyMessage('JWT expired')).toBe('로그인이 만료됐어요. 다시 로그인해 주세요.');
    expect(friendlyMessage('new row violates row-level security policy')).toBe('권한이 없어요.');
  });
  it('이미 한국어이거나 모르는 문구는 그대로', () => {
    expect(friendlyMessage('1초 이상 찍어 주세요')).toBe('1초 이상 찍어 주세요');
    expect(friendlyMessage(undefined)).toBeUndefined();
  });
});

describe('orderButtons', () => {
  it('취소는 따로 떼어 맨 아래에', () => {
    const { actions, cancel } = orderButtons([{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive' }]);
    expect(actions.map((a) => a.text)).toEqual(['삭제']);
    expect(cancel?.text).toBe('취소');
  });
});
