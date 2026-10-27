import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useAuth } from '@/features/auth/store';
import { operatorSessionKey, useAutomaticAudit, useCleanupPreview, useOperatorAccess, useOperatorAudit, useOperatorCases, useOperatorRun, useRequestManualCleanup } from '@/features/operator/queries';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { color, fontSize, size, space } from '@/shared/ui/tokens';
const labels: Record<string,string> = { queued: '처리 대기', processing: '처리 중', succeeded: '이번 처리 성공', partial: '부분 성공 · 미완료', failed: '실패 · 미완료', blocked: '보류 · 미완료', confirmed: '부재 확인 완료', pending: '대기', failed_exhausted: '자동 시도 소진 · 미완료', READY: '실행 가능', AUTOMATIC_PENDING: '자동 처리 중', RETENTION_UNKNOWN: '보존 판단 미확인', RETENTION_HOLD: '법적 보존 · 실행 불가', LINKS_UNCONFIRMED: '과거 링크 차단 미검증', BUSY: '다른 작업 진행 중', NO_PENDING_OBJECTS: '미삭제 파일 없음', EXECUTOR_REQUIRED: '실행 권한 없음', OPERATOR_REVOKED: '운영자 권한 변경', REVIEW_CHANGED: '보존 판단 변경', VERSION_LIMIT: '상태 버전 한도 · 실행 중단', SELECTION_CHANGED: '확인 정보 변경 · 다시 확인 필요', PREVIEW_EXPIRED: '확인 정보 만료 · 다시 확인 필요', RATE_LIMITED: '요청이 많아요 · 잠시 후 다시 확인', auth: '권한 확인 실패 · 자동 조회 중단', failures: '연속 조회 실패 · 자동 조회 중단', integrity: '상태 일관성 미확인 · 자동 조회 중단', version_limit: '상태 버전 한도 · 자동 조회 중단' };
const label = (v: string) => labels[v] ?? v;
const media = (asset: string, output?: string) => asset === 'thumb' ? '대표 썸네일' : output === 'mp4' ? 'MP4 원본' : output === 'jpeg' ? 'JPEG 원본' : '발행 파일';
type Selection = { rid: string; run: string | null; dialog: { rid: string; id: string; request: string } | null; notice: string | null };
export default function OperationsScreen() {
  const session = useAuth((s) => s.session);const identity = operatorSessionKey(session);
  return <Operations key={identity ?? 'signed-out'} />;
}
function Operations() {
  const router = useRouter();const access = useOperatorAccess();
  const ui = useMemo(() => createStore<Selection>(() => ({ rid: '', run: null, dialog: null, notice: null })), []);const selection = useStore(ui);
  const permitted = access.data?.allowed === true && !access.isError && !access.blocked;
  const run = useOperatorRun(selection.run, permitted);const denied = run.paused === 'auth';
  const allowed = permitted && !denied;const cases = useOperatorCases(allowed);
  const audit = useOperatorAudit(selection.rid || null, allowed, run.data?.status_version);const auto = useAutomaticAudit(allowed ? selection.rid || null : null);
  const preview = useCleanupPreview(allowed ? selection.dialog?.rid ?? null : null, selection.dialog?.id ?? null);
  const request = useRequestManualCleanup();
  const close = () => { if (!request.isPending) ui.setState({ dialog: null }); };
  const confirm = async () => {
    const dialog = ui.getState().dialog;if (!dialog || !preview.data?.eligible || request.isPending) return;
    try {
      const job = await request.mutateAsync({ rid: dialog.rid, preview_id: preview.data.preview_id, request_id: dialog.request });
      ui.setState({ rid: dialog.rid, run: job, dialog: null, notice: '서버에 단건 처리를 요청했어요.' });
    } catch (e) {
      const reason = e && typeof e === 'object' && 'reason' in e ? String(e.reason) : 'REQUEST_FAILED';
      // A transport failure retains the same idempotency key for a safe retry.
      ui.setState({ notice: label(reason), ...(['SELECTION_CHANGED','PREVIEW_EXPIRED','BUSY','OPERATOR_REVOKED','EXECUTOR_REQUIRED'].includes(reason) ? { dialog: null } : {}) });
    }
  };
  const begin = (rid: string) => { request.reset();ui.setState({ rid, notice: null, dialog: { rid, id: crypto.randomUUID(), request: crypto.randomUUID() } }); };
  return <SafeAreaView style={styles.root}>
    <Button label="뒤로" variant="secondary" onPress={() => router.back()} />
    <Text style={styles.heading}>운영자 결과물 정리</Text>
    {!allowed ? <View style={styles.row}><Text>{denied || access.blocked ? label('auth') : access.isPending ? '권한 확인 중' : '운영자 권한이 필요해요.'}</Text><Button label="권한 다시 확인" variant="secondary" onPress={() => { void access.recheckRights(); }} /></View> : <ScrollView contentContainerStyle={styles.content}>
      <Text>결과물 한 건의 미삭제 파일만 처리합니다. 자동 시도 횟수와 기존 링크·보존 정책은 유지됩니다.</Text>
      <Text>{access.data?.can_execute ? '실행 권한 있음' : '조회 전용 · 실행 불가'}</Text>
      <Button label="실패 목록 다시 확인" variant="secondary" disabled={cases.isFetching} onPress={() => void cases.refetch()} />
      {selection.notice ? <Text accessibilityLiveRegion="polite">{selection.notice}</Text> : null}
      {cases.isError ? <Text>목록을 확인하지 못했어요. 대상이 없다고 판정하지 않습니다.</Text> : cases.isPending ? <Text>목록 확인 중</Text> : cases.data?.length === 0 ? <Text>자동 시도를 소진한 미정리 파일이 없어요.</Text> : cases.data?.map((c) => <View key={c.result_id} testID={`operator-case-${c.result_id}`} style={styles.row}>
        <Text selectable>결과물 ID: {c.result_id}</Text><Text>{c.output.toUpperCase()} · 미삭제 {c.remaining}개 · {label(c.reason)}</Text>
        {c.latest_run_id ? <Button label="처리 상태 보기" variant="secondary" onPress={() => ui.setState({ rid: c.result_id, run: c.latest_run_id, notice: null })} /> : null}
        <Button label="단건 재처리 확인" variant="secondary" disabled={!access.data?.can_execute || request.isPending} onPress={() => begin(c.result_id)} />
      </View>)}
      {selection.run ? <View testID="operator-run" style={styles.row}>
        <Text selectable>작업 ID: {selection.run}</Text>
        {run.unknown ? <Text>현재 상태 조회 불가/확인 중 · 완료로 판정하지 않습니다.</Text> : null}
        {run.paused ? <Text>{label(run.paused)} · 수동으로 다시 확인해 주세요.</Text> : null}
        <Button label="상태 다시 확인" variant="secondary" onPress={run.recheck} />
        {run.lastCheckedAt ? <Text>마지막 유효 확인: {run.lastCheckedAt}{run.unknown ? ' · 이전 참고 정보' : ''}</Text> : null}
        {run.data ? <><Text>{label(run.data.status)} · 버전 {run.data.status_version}</Text><Text>누적 전체 정리: {run.data.cleanup_status === 'confirmed' ? '완료' : '미완료'}</Text><Text>제목 정리: {label(run.data.title_status)}</Text><Text>판정 사유: {label(run.data.reason)}</Text>
          {run.data.objects.map((o) => <View key={o.id} style={styles.object}><Text>{o.location === 'rotated' ? '회수 후 파일' : '기존 파일'} · {media(o.asset)}: {label(o.status)}</Text><Text>자동 {o.auto_attempts}/6회 · 수동 {o.manual_attempts}회 · {o.target ? '이번 대상' : '이전 완료 · 제외'}</Text><Text>{o.code ?? '검증 대기'}{o.verified_at ? ` · ${o.verified_at}` : ''}</Text></View>)}
          <Text>재요청은 최신 단건 확인창을 거쳐야 합니다. 실행 조건은 다시 검증합니다.</Text>
          {access.data?.can_execute && !['queued','processing','succeeded'].includes(run.data.status) ? <Button label="남은 파일 재처리 확인" variant="secondary" onPress={() => begin(run.data!.result_id)} /> : null}
        </> : null}
        <Text style={styles.heading}>수동 감사 이력</Text>{audit.isError ? <Text>감사 이력 조회 불가</Text> : audit.data?.map((a) => <Text key={a.id}>{a.created_at} · 실행자 {a.actor_id} · {a.object_id ?? '작업'} · {a.code} · v{a.status_version ?? '미배정'}</Text>)}
      </View> : null}
      {selection.rid ? <View style={styles.row}><Text style={styles.heading}>자동 실패 이력</Text>{auto.isError ? <Text>이력 조회 불가</Text> : auto.data?.map((a) => <Text key={a.id}>{a.started_at} · {a.object_id ?? a.task} · {a.attempt_no}회 · {a.code ?? '처리 중'}</Text>)}</View> : null}
    </ScrollView>}
    <BottomSheet visible={allowed && !!selection.dialog} title="이 결과물 재처리 확인" onClose={close}>
      <ScrollView contentContainerStyle={styles.content}>
        {preview.isPending ? <Text>최신 대상과 실행 조건 확인 중</Text> : preview.isError ? <><Text>조회하지 못했어요. 수량·안전 여부를 판정하지 않습니다.</Text><Button label="대상 다시 조회" variant="secondary" onPress={() => void preview.refetch()} /></> : preview.data ? <>
          <Text selectable>결과물 ID: {preview.data.result_id}</Text><Text>미삭제 {preview.data.remaining}개 · {preview.data.output.toUpperCase()}</Text>
          <Text>삭제 상태: {preview.data.deleted ? '삭제됨' : '미확인'} · 기존 링크 차단: {preview.data.links_confirmed ? '확인' : '미검증'}</Text>
          <Text>보존 판단: {preview.data.retention === 'clear' ? '보존 의무 없음으로 검토됨' : preview.data.retention === 'hold' ? '보존 대상' : '미확인'}</Text>
          <Text>실행 조건: {label(preview.data.reason)}</Text><Text>확인 시각: {preview.data.checked_at}</Text>
          {preview.data.objects.map((o) => <View key={o.id}><Text>{media(o.asset,preview.data!.output)} · 자동 {o.auto_attempts}/6회 {o.auto_attempts === 6 ? '소진' : '미소진'} · 수동 {o.manual_attempts}회</Text><Text>마지막 오류: {o.code ?? '없음'} · {o.last_failure_at ?? '시각 미확인'}</Text></View>)}
        </> : null}
        <Button label={request.isPending ? '요청 중' : '이 결과물 다시 처리'} danger disabled={!preview.data?.eligible || !access.data?.can_execute || request.isPending} onPress={() => void confirm()} />
        <Button label="취소" variant="secondary" disabled={request.isPending} onPress={close} />
      </ScrollView>
    </BottomSheet>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: color.bg, padding: space.lg, gap: space.md }, content: { gap: space.lg, paddingBottom: space.xxl }, heading: { fontSize: fontSize.heading, color: color.text }, row: { gap: space.sm, paddingVertical: space.lg, borderBottomWidth: size.hairline, borderColor: color.border }, object: { gap: space.xs, paddingVertical: space.sm } });
