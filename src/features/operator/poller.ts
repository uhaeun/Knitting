import { isProcessing, parseSnapshot, SnapshotError, stateFingerprint, type RunSnapshot } from './snapshot';
export type Pause = null | 'failures' | 'integrity' | 'auth' | 'version_limit';
export type PollState = { fetching: boolean; unknown: boolean; failures: number; paused: Pause; lastCheckedAt: string | null };
export type PollDependencies = {
  fetch: (requestId: string, signal: AbortSignal) => Promise<unknown>;
  accept: (s: RunSnapshot) => void; clear: (reason?: 'auth' | 'dispose') => void; change: (state: PollState) => void;
  report: (errorId: string, snapshot: RunSnapshot | null) => void;
  now?: () => number; uuid?: () => string;
};
type Flight = { started: number; epoch: number; manual: boolean; followup: boolean; abort: AbortController; requestId: string; timeout: ReturnType<typeof setTimeout>; queuedManual: boolean; recovery: boolean; integrityCheck: boolean };
/** Read-only coordinator: single logical flight, causal manual request IDs,
 * bounded freshness follow-up; no cleanup/mutation function is referenced. */
export class OperatorPoller {
  private active = false; private disposed = false; private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>; private flight?: Flight;
  private last: RunSnapshot | null = null; private due: number | null = null;
  private lastResume = -Infinity;
  private state: PollState = { fetching: false, unknown: true, failures: 0, paused: null, lastCheckedAt: null };
  private now: () => number; private uuid: () => string;
  constructor(private jobId: string, private d: PollDependencies, initial?: Pick<PollState, 'paused' | 'failures'>) {
    if (initial) this.state = { ...this.state, ...initial };
    this.now = d.now ?? (() => performance.now());this.uuid = d.uuid ?? (() => crypto.randomUUID());
  }
  private emit(patch: Partial<PollState>) { this.state = { ...this.state, ...patch };this.d.change(this.state); }
  private clearTimer() { if (this.timer) clearTimeout(this.timer);this.timer = undefined; }
  private schedule() {
    this.clearTimer();
    if (!this.active || this.disposed || this.state.paused || this.last !== null && !isProcessing(this.last) || this.due === null || this.flight) return;
    this.timer = setTimeout(() => { this.timer = undefined;void this.start(false, false); }, Math.max(0, this.due - this.now()));
  }
  setActive(value: boolean) {
    if (this.disposed || this.active === value) return;
    this.active = value;this.clearTimer();
    if (!value) {
      this.epoch++;
      if (this.flight) { clearTimeout(this.flight.timeout);this.flight.abort.abort();this.flight = undefined; }
      this.emit({ fetching: false });return;
    }
    if (this.state.paused) return;
    if (this.now() - this.lastResume >= 5000) {
      this.lastResume = this.now();void this.start(false, false);
    } else this.schedule();
  }
  manual() {
    if (!this.active || this.disposed) return;
    this.clearTimer();
    if (this.flight) {
      // One explicit intent is shared. A pre-click automatic response cannot
      // prove a post-click server observation: exactly one follow-up suffices.
      if (!this.flight.manual && !this.flight.followup) this.flight.queuedManual = true;
      return;
    }
    void this.start(true, false);
  }
  private live(f: Flight) { return !this.disposed && this.active && this.flight === f && this.epoch === f.epoch; }
  private async start(manual: boolean, followup: boolean, integrityCheck = false) {
    if (this.disposed || !this.active || this.flight || !manual && this.state.paused) return;
    this.clearTimer();
    const abort = new AbortController();const requestId = this.uuid();
    const f: Flight = { started: this.now(), epoch: this.epoch, manual, followup, abort, requestId, queuedManual: false, recovery: !!this.state.paused, integrityCheck, timeout: setTimeout(() => undefined, 0) };
    this.flight = f;this.emit({ fetching: true, unknown: true });
    const timeout = new Promise<never>((_, reject) => {
      clearTimeout(f.timeout);f.timeout = setTimeout(() => { abort.abort();reject(new Error('STATUS_TIMEOUT')); }, 8000);
    });
    let needsFollowup = false;let needsIntegrity = false;
    try {
      const raw = await Promise.race([this.d.fetch(requestId, abort.signal), timeout]);
      if (!this.live(f)) return;
      const s = parseSnapshot(raw, this.jobId, requestId);
      if (this.last) {
        const v = BigInt(s.status_version), old = BigInt(this.last.status_version);
        const manifestChanged=s.objects.length!==this.last.objects.length || s.objects.some((o)=>{
          const previous=this.last!.objects.find((item)=>item.id===o.id);
          return !previous || o.asset!==previous.asset || o.location!==previous.location || o.target!==previous.target || o.auto_attempts!==previous.auto_attempts || o.manual_attempts<previous.manual_attempts || previous.status==='confirmed' && (o.status!=='confirmed' || o.verified_at!==previous.verified_at || o.manual_attempts!==previous.manual_attempts);
        });
        if (s.result_id !== this.last.result_id || manifestChanged || v < old || v === old && (stateFingerprint(s) !== stateFingerprint(this.last) || s.checked_at < this.last.checked_at)) throw new SnapshotError();
      }
      if(this.now()-f.started>=8000)throw new Error('STATUS_TIMEOUT');
      this.last = s;this.d.accept(s);
      // A nonce echoed by the server in a GET sent after a manual click is the
      // freshness barrier. Client wall-clock and arrival order are never used.
      this.emit({ unknown: false, failures: 0, paused: s.integrity_code === 'VERSION_LIMIT' ? 'version_limit' : null, lastCheckedAt: s.checked_at });
      this.due = this.now() + 10000;
      needsFollowup = f.queuedManual; // even a terminal pre-click response needs a fresh observation
    } catch (error) {
      if (!this.live(f)) return;
      const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
      if(this.now()-f.started>=8000 && status!==401 && status!==403)error=new Error('STATUS_TIMEOUT');
      if (status === 401 || status === 403) {
        this.last = null;this.due = null;this.d.clear('auth');this.emit({ paused: 'auth', unknown: true, lastCheckedAt: null });
      } else if (error instanceof SnapshotError) {
        this.emit({ unknown: true });
        if (followup) {
          this.emit({ paused: 'integrity' });this.d.report(this.uuid(), this.last);
        } else { needsFollowup = true;needsIntegrity = true; }
      } else {
        const failures = this.state.failures + 1;
        this.emit({ failures, unknown: true, paused: followup && f.integrityCheck ? 'integrity' : this.state.paused ?? (failures >= 3 ? 'failures' : null) });
        this.due = this.now() + 10000; // timeout at 8s -> next request at 18s
        if (followup && f.integrityCheck) this.d.report(this.uuid(), this.last);
        else needsFollowup = f.queuedManual;
      }
    } finally {
      clearTimeout(f.timeout);
      if (this.live(f)) {
        this.flight = undefined;this.emit({ fetching: false });
        if (needsFollowup && (this.state.paused !== 'auth' || needsIntegrity) && this.state.paused !== 'version_limit') {
          // A follow-up from an integrity fault is a recovery request, even if
          // it was initiated by automatic polling. Never queue another follow-up.
          void this.start(true, true, needsIntegrity);
        } else this.schedule();
      }
    }
  }
  dispose() { this.setActive(false);this.disposed = true;this.last = null;this.d.clear('dispose'); }
}
