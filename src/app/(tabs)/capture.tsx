import { Redirect } from 'expo-router';

// 탭바 가운데 버튼이 가로채므로 여기로 오지 않는다. 직접 열렸을 때의 대비.
export default function CaptureTabPlaceholder() {
  return <Redirect href="/projects" />;
}
