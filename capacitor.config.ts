import type { CapacitorConfig } from '@capacitor/cli';

// 개발용 실시간 반영: CAP_DEV_URL을 주고 sync하면 앱이 dist 대신 내 컴퓨터 개발 서버를 불러온다.
// 화면 코드를 고쳐도 앱을 다시 빌드할 필요가 없다. 테스터용 빌드는 반드시 이 값 없이 sync한다 (scripts/app-dev.sh 참고).
const devUrl = process.env.CAP_DEV_URL;
// Appium 시험 빌드만 로컬 Supabase(http://10.0.2.2)에 연결한다.
const localTest = process.env.CAP_LOCAL_TEST === '1';

const config: CapacitorConfig = {
  appId: 'app.knitting.web',
  appName: '닛팅',
  webDir: 'dist',
  backgroundColor: '#F8F6F1',
  ios: {
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#F8F6F1',
  },
  android: {
    allowMixedContent: localTest,
    backgroundColor: '#F8F6F1',
  },
  server: devUrl ? { url: devUrl, cleartext: true } : { androidScheme: localTest ? 'http' : 'https', cleartext: localTest },
  plugins: {
    SplashScreen: { launchAutoHide: true, backgroundColor: '#F8F6F1' },
  },
};

export default config;
