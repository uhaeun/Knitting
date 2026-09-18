/**
 * 디자인 토큰 — 모든 스타일의 유일한 출처.
 * 값 출처: docs/닛팅_디자인브리프.html + Claude Design 시안 (2026-09-06)
 * 화면에서 색상값·픽셀 숫자를 직접 쓰지 않는다. 여기 상수만 참조한다.
 */

export const color = {
  // 밝은 화면 (목록, 타임라인, 시트)
  // 강조색은 하은의 손글씨 로고에서 뽑은 주황. 새로 만들지 않았다
  bg: '#F8F6F1', // 종이빛. 흰색보다 눈이 덜 부시다
  surface: '#FFFFFF', // 카드, 시트
  text: '#23211D', // 따뜻한 먹색. 순수 검정 아님
  textMuted: '#6E6B63',
  border: '#E3DFD6', // 1px 헤어라인
  accent: '#C8523C', // 로고 주황. 셔터, 선택 상태, 주요 버튼
  accentPressed: '#A8422F',
  accentSoft: '#F4E2DC', // 선택된 탭 뒤 알약. 주황을 아주 옅게
  danger: '#8F3A24', // 삭제 등. 주황과 헷갈리지 않게 더 어둡게
  tickInactive: '#D8D3C7', // 스크러버 미도달 눈금
  overlay: 'rgba(35,33,29,0.34)', // 시트 뒤 딤

  // 어두운 화면 (촬영)
  cameraBg: '#0B0C0A',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.6)',
  onDarkSecondary: 'rgba(255,255,255,0.72)',
  onDarkBorder: 'rgba(255,255,255,0.28)',
  onDarkHint: '#E08A6F', // 첫 촬영 안내 박스 세로선
  gridLine: 'rgba(255,255,255,0.5)',
  recording: '#D6453D', // 녹화 중 셔터 테두리·REC 배지
  photoLabelBg: 'rgba(11,12,10,0.55)', // 결과 사진 위 라벨 바탕. 밝은 편물 위에서도 흰 글씨가 읽히는 농도
} as const;

export const fontSize = {
  title: 28, // 화면 제목
  heading: 20, // 섹션 제목, 시트 제목
  body: 17, // 본문, 버튼, 입력
  label: 15, // 토글, 안내문
  caption: 13, // 보조 텍스트, 탭 라벨
  micro: 11, // 촬영 화면 작은 배지
} as const;

export const fontWeight = {
  regular: '400',
  semibold: '600',
} as const;

// 4px 배수
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  photo: 8,
  button: 10,
  card: 12,
  sheet: 16,
  pill: 999,
} as const;

export const size = {
  tap: 44, // 최소 터치 영역
  buttonHeight: 48,
  primaryButtonHeight: 52,
  inputHeight: 48,
  thumb: 76, // 편물 카드 썸네일
  shutter: 84, // 촬영 버튼 바깥 지름
  shutterInner: 72, // 촬영 버튼 안쪽 지름
  albumButton: 56,
  tabBarHeight: 52,
  tick: { width: 2, height: 11, gap: 2 }, // 편물 카드 "쌓임" 눈금
  hairline: 1,
  // 넓은 창(데스크톱·VS Code)에서도 폰 너비 한 칸으로 보여 준다
  webColumn: 480,
  webPhotoMin: 200, // 창이 아주 낮아도 사진이 이보다 작아지지 않는다
  webTimelineChrome: 320, // 타임라인에서 사진 외 세로 공간 (헤더·날짜·스크러버·버튼 2개)
  webCaptureChrome: 316, // 촬영 화면에서 사진 외 세로 공간 (상단 바·모드 토글·겹치기 컨트롤·셔터 줄)
  webResultChrome: 300, // 결과 사진 화면에서 미리보기 외 세로 공간 (헤더·종류 선택·버튼 2개)
} as const;

export const ghostOpacity = {
  off: 0,
  low: 0.3,
  high: 0.6,
} as const;

export type GhostLevel = keyof typeof ghostOpacity;
