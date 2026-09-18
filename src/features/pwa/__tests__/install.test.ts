import { installStateOf, platformOf } from '@/features/pwa/install';

describe('platformOf', () => {
  it('iPhone·iPad는 ios', () => {
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Safari')).toBe('ios');
    expect(platformOf('Mozilla/5.0 (iPad; CPU OS 18_7) Safari')).toBe('ios');
  });
  it('터치되는 Macintosh(iPadOS)도 ios', () => {
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari Touch')).toBe('ios');
  });
  it('안드로이드와 데스크톱', () => {
    expect(platformOf('Mozilla/5.0 (Linux; Android 14) Chrome')).toBe('android');
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome')).toBe('desktop');
  });
});

describe('installStateOf', () => {
  it('이미 홈 화면 앱이면 안내하지 않는다', () => {
    expect(installStateOf({ platform: 'ios', standalone: true, canPrompt: false })).toBe('installed');
    expect(installStateOf({ platform: 'android', standalone: true, canPrompt: true })).toBe('installed');
  });
  it('브라우저가 설치 버튼을 주면 버튼으로', () => {
    expect(installStateOf({ platform: 'android', standalone: false, canPrompt: true })).toBe('prompt');
  });
  it('iPhone은 손으로 따라 하는 안내', () => {
    expect(installStateOf({ platform: 'ios', standalone: false, canPrompt: false })).toBe('guide');
  });
  it('데스크톱에서 설치 버튼이 없으면 안내하지 않는다', () => {
    expect(installStateOf({ platform: 'desktop', standalone: false, canPrompt: false })).toBe('none');
  });
});
