import { Image } from 'expo-image';

import strokes from './journal-icons.json';
import { color, size } from './tokens';

export type JournalIconName = keyof typeof strokes;

type Props = {
  name: JournalIconName;
  tint?: string;
  dimension?: number;
  selected?: boolean;
};

/** The controls supply their own accessible labels. All artwork is local. */
export function JournalIcon({ name, tint = color.journalInk, dimension = size.journalGlyph, selected = false }: Props) {
  const brand = name === 'brand';
  const viewBox = brand ? '0 0 100 100' : '0 0 24 24';
  const width = brand ? 5.4 : name === 'more' ? 3.2 : selected ? 2.1 : 1.65;
  const paths = strokes[name].map(d => `<path d="${d}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="${tint}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no" source={{ uri: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) }}
    style={{ width: dimension, height: dimension }} />;
}
