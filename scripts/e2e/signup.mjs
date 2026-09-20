// 모든 E2E가 쓰는 가입 절차. 이메일 확인이 켜져 있으면 로컬 메일함(Mailpit)에서 링크를 꺼내 누른다.
const MAIL = 'http://127.0.0.1:54324';

export async function confirmLink(to) {
  for (let i = 0; i < 30; i += 1) {
    const list = await fetch(`${MAIL}/api/v1/messages?limit=50`).then((r) => r.json()).catch(() => ({}));
    const hit = (list.messages ?? []).find((m) => (m.To ?? []).some((t) => t.Address === to));
    if (hit) {
      const msg = await fetch(`${MAIL}/api/v1/message/${hit.ID}`).then((r) => r.json());
      const link = (msg.Text ?? msg.HTML ?? '').match(/https?:\/\/[^\s"<>]*token[^\s"<>]*/)?.[0];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`확인 메일이 오지 않았어요: ${to}`);
}

/** 가입 + 첫 설정까지 끝내고 편물 목록에 선다 */
export async function signUp(page, { base, email, username, displayName, password = 'password123' }) {
  await page.goto(base, { timeout: 180000 });
  await page.getByText('계정이 없어요, 가입할게요').click({ timeout: 120000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('8자 이상').fill(password);
  await page.getByRole('checkbox', { name: '약관과 개인정보처리방침에 동의합니다' }).click();
  await page.getByRole('button', { name: '가입하기' }).click();

  // 이메일 확인이 켜져 있으면 메일을 기다리는 화면이 뜬다
  const waiting = page.getByText('확인 메일을 보냈어요', { exact: false });
  const onboarding = page.getByPlaceholder('knitter_haeun');
  await Promise.race([
    waiting.waitFor({ timeout: 60000 }).catch(() => {}),
    onboarding.waitFor({ timeout: 60000 }).catch(() => {}),
  ]);
  if (await waiting.isVisible().catch(() => false)) {
    await page.goto(await confirmLink(email), { timeout: 60000 });
  }

  await onboarding.waitFor({ timeout: 60000 });
  await onboarding.fill(username);
  await page.getByPlaceholder('하은').fill(displayName);
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('button', { name: '편물 만들기' }).waitFor({ timeout: 60000 });
}
