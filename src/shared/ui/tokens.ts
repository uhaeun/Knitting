import palette from './palette.json';

/** 앱과 설치 아이콘에 함께 쓰는 편물 기록장의 색. */
export const color = {
  bg: palette.bg,
  journalInk: palette.ink,
  journalPaper: palette.surface,
  journalLinen: palette.linen,
  surface: palette.surface,
  text: palette.ink,
  textMuted: palette.muted,
  border: palette.border,
  accent: palette.accent,
  accentPressed: palette.accentPressed,
  accentSoft: palette.accentSoft,
  danger: '#93392E',
  tickInactive: '#D3D2D0',
  overlay: 'rgba(48,47,49,0.34)',

  // 어두운 화면 (촬영)
  cameraBg: '#0B0C0A',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.6)',
  onDarkSecondary: 'rgba(255,255,255,0.72)',
  onDarkBorder: 'rgba(255,255,255,0.28)',
  onDarkAccent: '#A5C8CE', // 촬영 안내와 셔터
  gridLine: 'rgba(255,255,255,0.5)',
  recording: '#BF433C', // 녹화 중 셔터 테두리·REC 배지
  photoLabelBg: 'rgba(11,12,10,0.55)', // 결과 사진 위 라벨 바탕. 밝은 편물 위에서도 흰 글씨가 읽히는 농도
} as const;

export const journalType = {
  number: '"Barlow Condensed", "Arial Narrow", sans-serif',
  korean: '"Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", sans-serif',
  medium: '500',
} as const;

export const fontSize = {
  calendarMonth: 54,
  calendarDay: 18,
  journalTitle: 34,
  coverTitle: 23,
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
  calendarWeekRatio: 6,
  narrowCalendarWidth: 350,
  journalCoverRatio: 1.95,
  journalCompactThumb: 64,
  journalMark: 32,
  journalGlyph: 24,
  journalSmallGlyph: 19,
  journalTabHeight: 64,
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
