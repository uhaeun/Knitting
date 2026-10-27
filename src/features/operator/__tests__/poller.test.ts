import { OperatorPoller, type PollState } from '../poller';
import { parseSnapshot, SnapshotError, type RunSnapshot } from '../snapshot';
const job = 'b1111111-1111-4111-8111-111111111111';
const result = 'b2222222-2222-4222-8222-222222222222';
let nonce = 0;
const uuid = () => `b3333333-3333-4333-8333-${String(++nonce).padStart(12, '0')}`;
function snapshot(request: string, patch: Partial<RunSnapshot> = {}): RunSnapshot {
  return { job_id: job, result_id: result, request_id: request, status_version: '1', checked_at: `2026-10-27T00:00:${String(nonce % 60).padStart(2,'0')}.000000Z`, integrity_code: null,
    status: 'queued', reason: 'READY', cleanup_status: 'failed_exhausted', title_status: 'confirmed', can_retry: false,
    objects: ['file','thumb'].map((asset, i) => ({ id: `b4444444-4444-4444-8444-44444444444${i}`, asset: asset as 'file' | 'thumb', location: 'original', target: true, status: 'pending', auto_attempts: 6, manual_attempts: 0, code: null, verified_at: null })), ...patch };
}
function setup(fetcher?: (nonce: string, signal: AbortSignal) => Promise<unknown>, initial?: Pick<PollState,'paused'|'failures'>) {
  const starts: number[] = [];let state: PollState | null = null;
  const fetch = jest.fn((id: string, signal: AbortSignal) => { starts.push(performance.now());return fetcher ? fetcher(id,signal) : Promise.resolve(snapshot(id)); });
  const accept = jest.fn();const clear = jest.fn();const report = jest.fn();
  const poller = new OperatorPoller(job, { fetch, accept, clear, report, uuid, change: (s) => { state = s; } }, initial);
  return { poller, fetch, accept, clear, report, starts, state: () => state! };
}
const tick = (ms = 0) => jest.advanceTimersByTimeAsync(ms);
beforeEach(() => { jest.useFakeTimers();nonce = 0; });
afterEach(() => { jest.clearAllTimers();jest.useRealTimers(); });
it('polls once on entry and exactly ten seconds after response completion', async () => {
  const t = setup();t.poller.setActive(true);await tick();expect(t.starts).toEqual([0]);
  await tick(9999);expect(t.fetch).toHaveBeenCalledTimes(1);await tick(1);expect(t.starts).toEqual([0,10000]);
  t.poller.dispose();
});
it('stops on a terminal state without another automatic read', async () => {
  const t = setup(async (id) => { const s = snapshot(id);return { ...s, status: 'succeeded', cleanup_status: 'confirmed', objects: s.objects.map((o) => ({ ...o, status: 'confirmed', verified_at: s.checked_at })) }; });
  t.poller.setActive(true);await tick(60000);expect(t.fetch).toHaveBeenCalledTimes(1);expect(t.state().unknown).toBe(false);t.poller.dispose();
});
it('three 8s timeouts start requests at 0,18,36 seconds and ignore late success', async () => {
  const replies: (() => void)[] = [];
  const t = setup((id) => new Promise((resolve) => replies.push(() => resolve(snapshot(id)))));
  t.poller.setActive(true);await tick(44000);expect(t.starts).toEqual([0,18000,36000]);expect(t.state()).toMatchObject({ failures: 3, paused: 'failures', unknown: true });
  replies.forEach((r) => r());await tick(60000);expect(t.accept).not.toHaveBeenCalled();expect(t.fetch).toHaveBeenCalledTimes(3);t.poller.dispose();
});
it('a timeout is counted once even when the aborted fetch also rejects', async () => {
  const t = setup((_, signal) => new Promise((__, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
  t.poller.setActive(true);await tick(8000);expect(t.state().failures).toBe(1);expect(t.starts).toEqual([0]);await tick(10000);expect(t.starts).toEqual([0,18000]);t.poller.dispose();
});
it('requires explicit manual recovery after three failures; schedules from manual completion', async () => {
  let fails = true;const t = setup(async (id) => { if (fails) throw new Error('offline');return snapshot(id); });
  t.poller.setActive(true);await tick(20000);expect(t.state().paused).toBe('failures');
  t.poller.setActive(false);await tick(10000);t.poller.setActive(true);await tick(20000);expect(t.fetch).toHaveBeenCalledTimes(3);
  fails = false;t.poller.manual();await tick();expect(t.state()).toMatchObject({ failures: 0, paused: null });const count = t.fetch.mock.calls.length;
  await tick(9999);expect(t.fetch).toHaveBeenCalledTimes(count);await tick(1);expect(t.fetch).toHaveBeenCalledTimes(count+1);t.poller.dispose();
});
it('failed manual recovery stays paused and makes no hidden retries', async () => {
  const t = setup(async () => { throw new Error('offline'); }, { paused: 'failures', failures: 3 });
  t.poller.setActive(true);await tick(30000);expect(t.fetch).not.toHaveBeenCalled();t.poller.manual();await tick(30000);expect(t.fetch).toHaveBeenCalledTimes(1);expect(t.state().paused).toBe('failures');t.poller.dispose();
});
it.each([401,403])('HTTP %s stops immediately and clears privileged data', async (status) => {
  const t = setup(async () => { throw Object.assign(new Error('denied'), { status }); });t.poller.setActive(true);await tick(30000);
  expect(t.fetch).toHaveBeenCalledTimes(1);expect(t.state()).toMatchObject({ paused: 'auth', unknown: true, lastCheckedAt: null });expect(t.clear).toHaveBeenCalledWith('auth');t.poller.dispose();
});
it('merges duplicate activation events and preserves the existing ten-second deadline', async () => {
  const t = setup();t.poller.setActive(true);await tick(1000);t.poller.setActive(false);await tick(1000);t.poller.setActive(true);t.poller.setActive(true);t.poller.setActive(true);
  await tick(7999);expect(t.fetch).toHaveBeenCalledTimes(1);await tick(1);expect(t.starts).toEqual([0,10000]);t.poller.dispose();
});
it('allows a new return at the exact five-second boundary', async () => {
  const t = setup();t.poller.setActive(true);await tick(1000);t.poller.setActive(false);await tick(4000);t.poller.setActive(true);await tick();expect(t.starts).toEqual([0,5000]);t.poller.dispose();
});
it('restores one overdue poll even when the new return is inside five seconds', async () => {
  let count = 0;const t = setup((id) => ++count === 2 ? new Promise(() => undefined) : Promise.resolve(snapshot(id)));
  t.poller.setActive(true);await tick(6000);t.poller.setActive(false);await tick(2000);t.poller.setActive(true);await tick(1000);t.poller.setActive(false);await tick(3000);t.poller.setActive(true);t.poller.setActive(true);await tick();
  expect(t.starts).toEqual([0,8000,12000]);expect(t.state().failures).toBe(0);t.poller.dispose();
});
it('does not accumulate missed background ticks', async () => {
  const t = setup();t.poller.setActive(true);await tick(1000);t.poller.setActive(false);await tick(60000);expect(t.fetch).toHaveBeenCalledTimes(1);t.poller.setActive(true);t.poller.setActive(true);await tick();expect(t.fetch).toHaveBeenCalledTimes(2);t.poller.dispose();
});
it('coalesces repeated manual clicks during an automatic read into one causal follow-up', async () => {
  let resolveFirst: (() => void) | undefined;let count = 0;
  const t = setup((id) => ++count === 1 ? new Promise((resolve) => { resolveFirst = () => resolve(snapshot(id)); }) : Promise.resolve(snapshot(id)));
  t.poller.setActive(true);await tick(1000);t.poller.manual();t.poller.manual();t.poller.manual();expect(t.fetch).toHaveBeenCalledTimes(1);resolveFirst!();await tick();expect(t.fetch).toHaveBeenCalledTimes(2);expect(t.state().failures).toBe(0);t.poller.dispose();
});
it('counts one failed shared request per HTTP call, not per manual click', async () => {
  let rejectFirst: (() => void) | undefined;let count = 0;
  const t = setup(() => ++count === 1 ? new Promise((_, reject) => { rejectFirst = () => reject(new Error('offline')); }) : Promise.reject(new Error('offline')));
  t.poller.setActive(true);await tick(1000);t.poller.manual();t.poller.manual();rejectFirst!();await tick();expect(t.fetch).toHaveBeenCalledTimes(2);expect(t.state().failures).toBe(2);t.poller.dispose();
});
it('bounds integrity repair at one follow-up and requires manual recovery', async () => {
  let bad = true;const t = setup(async (id) => ({ ...snapshot(id), status_version: bad ? '0' : '1' }));
  t.poller.setActive(true);await tick(30000);expect(t.fetch).toHaveBeenCalledTimes(2);expect(t.state().paused).toBe('integrity');expect(t.report).toHaveBeenCalledTimes(1);
  t.poller.setActive(false);t.poller.setActive(true);await tick(10000);expect(t.fetch).toHaveBeenCalledTimes(2);bad = false;t.poller.manual();await tick();expect(t.state().paused).toBeNull();await tick(10000);expect(t.fetch).toHaveBeenCalledTimes(4);t.poller.dispose();
});
it('a failed integrity follow-up pauses immediately instead of entering another retry loop', async () => {
  let count=0;const t = setup(async (id) => { if (++count===1) return { ...snapshot(id), status_version: '0' };throw new Error('offline'); });
  t.poller.setActive(true);await tick(60000);expect(t.fetch).toHaveBeenCalledTimes(2);expect(t.state().paused).toBe('integrity');t.poller.dispose();
});
it('same-version changed objects never replace the last consistent snapshot', async () => {
  let changed = false;const t = setup(async (id) => { const s = snapshot(id);return changed ? { ...s, status: 'processing', objects: s.objects.map((o,i) => i ? o : { ...o, status: 'processing', manual_attempts: 1 }) } : s; });
  t.poller.setActive(true);await tick();changed=true;await tick(10000);expect(t.fetch).toHaveBeenCalledTimes(3);expect(t.accept).toHaveBeenCalledTimes(1);expect(t.state()).toMatchObject({ paused:'integrity', unknown:true });t.poller.dispose();
});
it('same-version reversed server time requests only one fresh follow-up', async () => {
  let count=0;const t=setup(async (id) => ({ ...snapshot(id), checked_at: ++count===2 ? '2026-10-26T00:00:00.000000Z' : '2026-10-27T00:00:00.000000Z' }));
  t.poller.setActive(true);await tick(10000);expect(t.fetch).toHaveBeenCalledTimes(3);expect(t.state().paused).toBeNull();t.poller.dispose();
});
it('version saturation stops new automatic reads', async () => {
  const t=setup(async (id) => ({ ...snapshot(id), status_version:'9223372036854775807', integrity_code:'VERSION_LIMIT' }));t.poller.setActive(true);await tick(60000);expect(t.fetch).toHaveBeenCalledTimes(1);expect(t.state().paused).toBe('version_limit');t.poller.dispose();
});
it('screen cancellation and old-session late responses do not count or apply', async () => {
  let done: (()=>void)|undefined;const t=setup((id)=>new Promise((resolve)=>{done=()=>resolve(snapshot(id));}));
  t.poller.setActive(true);await tick(1000);t.poller.setActive(false);done!();await tick(60000);expect(t.accept).not.toHaveBeenCalled();expect(t.state().failures).toBe(0);t.poller.dispose();
});
it.each(['0','-1','1.5','9223372036854775808',null,0,9007199254740992])('rejects invalid BIGINT representation %s', (version) => {
  expect(()=>parseSnapshot({ ...snapshot('req'),status_version:version },job,'req')).toThrow(SnapshotError);
});
it('keeps BIGINT precision above the JavaScript integer limit',()=>{
  expect(parseSnapshot({ ...snapshot('req'),status_version:'9007199254740993' },job,'req').status_version).toBe('9007199254740993');
});
it.each(['2026-02-30T00:00:00.000000Z','2026-10-27T00:00:00+09:00','not-a-date'])('rejects invalid UTC checked_at %s',(checked_at)=>{
  expect(()=>parseSnapshot({...snapshot('req'),checked_at},job,'req')).toThrow(SnapshotError);
});
it('rejects hidden fields, wrong task IDs and fabricated aggregate success',()=>{
  expect(()=>parseSnapshot({...snapshot('req'),file_path:'private'},job,'req')).toThrow(SnapshotError);
  expect(()=>parseSnapshot(snapshot('req'),result,'req')).toThrow(SnapshotError);
  expect(()=>parseSnapshot({...snapshot('req'),cleanup_status:'confirmed'},job,'req')).toThrow(SnapshotError);
});

it.each(['manifest','counter'])('higher versions cannot replace/reset the fixed %s',async(mode)=>{
  let changed=false;const t=setup(async(id)=>{const s=snapshot(id);return changed?{...s,status_version:'2',objects:s.objects.map((o,i)=>i?o:{...o,...(mode==='manifest'?{id:'b5555555-5555-4555-8555-555555555555'}:{auto_attempts:5})})}:s;});
  t.poller.setActive(true);await tick();changed=true;await tick(10000);expect(t.accept).toHaveBeenCalledTimes(1);expect(t.state().paused).toBe('integrity');t.poller.dispose();
});
it('remount preserves an integrity pause until an explicit valid manual read',async()=>{
  const t=setup(undefined,{paused:'integrity',failures:1});t.poller.setActive(true);await tick(30000);expect(t.fetch).not.toHaveBeenCalled();t.poller.manual();await tick();expect(t.state().paused).toBeNull();await tick(10000);expect(t.fetch).toHaveBeenCalledTimes(2);t.poller.dispose();
});
