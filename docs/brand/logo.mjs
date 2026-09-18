import { chromium } from '/Users/yuha/Desktop/playwright_260917/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2];
mkdirSync(out, { recursive: true });

/**
 * '닛팅' 로고. 손그림 구성(왼쪽 아래 → 오른쪽 위로 자람)을 지키되
 * 획 굵기·코 크기·간격을 고르게 정리했다. 손맛은 작은 기울기로만 남긴다.
 */
const logo = ({ ink, w = 5.2, stitches = 3 }) => {
  // 겉뜨기 코가 ㅌ과 ㅇ 사이를 곧게 타고 오른다
  const chev = [];
  for (let i = 0; i < stitches; i += 1) {
    const x = 69;
    const y = 60 - i * 11.5;
    chev.push(`<path d="M ${x - 5.2} ${y} L ${x} ${y - 5.6} L ${x + 5.2} ${y}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <g fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">
      <g transform="rotate(-2 16 83)"><path d="M10 74 L10 90 L25 90"/></g>
      <g transform="rotate(1.5 34 72)"><path d="M34 58 L27 85 M34 62 L41 85"/></g>
      <g transform="rotate(-1 53 56)"><path d="M46 40 L60 40 M46 40 L46 72 M46 56 L58 56 M46 72 L60 72"/></g>
      ${chev.join('\n      ')}
      <g transform="rotate(7 86 26)"><ellipse cx="86" cy="26" rx="10.5" ry="15"/></g>
    </g>
  </svg>`;
};

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
const render = async (file, { bg, ink, pad, w }) => {
  await p.setContent(`<body style="margin:0">
    <div style="width:1024px;height:1024px;background:${bg};display:flex;align-items:center;justify-content:center">
      <div style="width:${pad}%;height:${pad}%">${logo({ ink, w })}</div>
    </div></body>`);
  await p.screenshot({ path: `${out}/${file}` });
};
await render('logo-icon.png', { bg: '#F8F6F1', ink: '#C8523C', pad: 92, w: 5.2 });
await render('logo-mask.png', { bg: '#F8F6F1', ink: '#C8523C', pad: 68, w: 6.0 });
await render('logo-fav.png', { bg: '#F8F6F1', ink: '#C8523C', pad: 96, w: 6.6 });

// 미리보기 한 장
await p.setViewportSize({ width: 560, height: 230 });
const png = (f) => readFileSync(`${out}/${f}`).toString('base64');
await p.setContent(`<body style="margin:0;background:#ececea;display:flex;gap:26px;padding:22px;align-items:flex-end;font:12px -apple-system">
  ${[180, 120, 64, 40].map((s) => `<div style="text-align:center">
    <img src="data:image/png;base64,${png('logo-icon.png')}" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * 0.23)}px;display:block">
    <div style="margin-top:6px">${s}</div></div>`).join('')}
  <div style="text-align:center"><img src="data:image/png;base64,${png('logo-mask.png')}" style="width:64px;height:64px;border-radius:50%;display:block"><div style="margin-top:6px">원형</div></div>
</body>`);
await p.waitForTimeout(250);
await p.screenshot({ path: `${out}/logo-preview.png` });
await browser.close();
console.log('done');
