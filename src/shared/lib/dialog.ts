import { Alert, type AlertButton } from 'react-native';

/** 확인·선택 대화상자. 웹(react-native-web)의 Alert는 아무것도 띄우지 않아서 화면은 이 함수만 쓴다. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  Alert.alert(title, message, buttons);
}
