import { parseRecovery, validateNewPassword } from '@/features/auth/recovery';

describe('parseRecovery', () => {
  it('메일 링크의 해시에서 토큰을 꺼낸다', () => {
    const url = 'https://knitting-pied.vercel.app/#access_token=aaa&refresh_token=bbb&type=recovery&expires_in=3600';
    expect(parseRecovery(url)).toEqual({ kind: 'tokens', type: 'recovery', accessToken: 'aaa', refreshToken: 'bbb' });
  });
  it('가입 확인 링크도 알아본다', () => {
    expect(parseRecovery('https://x.dev/#access_token=aaa&refresh_token=bbb&type=signup'))
      .toEqual({ kind: 'tokens', type: 'signup', accessToken: 'aaa', refreshToken: 'bbb' });
  });
  it('모르는 종류는 무시한다', () => {
    expect(parseRecovery('https://x.dev/#access_token=aaa&refresh_token=bbb&type=magiclink')).toBeNull();
  });
  it('링크가 만료되면 오류 문구를 한국어로 돌려준다', () => {
    const url = 'https://x.dev/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    expect(parseRecovery(url)).toEqual({ kind: 'error', message: '링크가 만료됐어요. 다시 보내 주세요.' });
  });
  it('평범한 주소는 null', () => {
    expect(parseRecovery('https://knitting-pied.vercel.app/projects')).toBeNull();
    expect(parseRecovery('')).toBeNull();
  });
});

describe('validateNewPassword', () => {
  it('6자 미만은 막는다', () => {
    expect(validateNewPassword('12345', '12345')).toBe('비밀번호는 6자 이상');
  });
  it('확인이 다르면 막는다', () => {
    expect(validateNewPassword('123456', '123457')).toBe('두 번 입력한 비밀번호가 달라요');
  });
  it('맞으면 null', () => {
    expect(validateNewPassword('123456', '123456')).toBeNull();
  });
});
