import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  discoveryStageEventSchema,
  type DiscoveryCriteria,
  type DiscoveryStageEvent,
} from '@capability-hub/contracts';
import type {
  DiscoveryDirectionResponse,
  DiscoveryEntryResponse,
  DiscoveryResultResponse,
  DiscoveryTurnResponse,
} from '@capability-hub/contracts/http';
import type { ApiErrorContext } from '../../shared/api/client.js';
import { ApiError, api, postEvents } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';

/** 一轮对话在页面内的全部状态；只存在内存里，离开发现页即丢弃。 */
export interface DiscoveryTask {
  kind: 'guide' | 'matches' | 'reference';
  reply: string;
  goal: string | null;
  criteria: DiscoveryCriteria;
  context: string | null;
  directions: DiscoveryDirectionResponse[];
  items: DiscoveryResultResponse[];
  partial: DiscoveryResultResponse[];
  missing: string[];
  reference: DiscoveryResultResponse | null;
  total: number;
  /** 产生这一轮的问题原文，显示在结果面板顶部。 */
  question: string;
}

/** 首帧抵达前处于 start；卡片数量在随后的起草与核对阶段保留。 */
export interface DiscoveryProgress {
  stage: 'start' | DiscoveryStageEvent['stage'];
  resources?: number;
  complete?: boolean;
  characters?: number;
}

interface Request {
  action: 'message' | 'filter' | 'direction';
  text?: string;
  criteria?: DiscoveryCriteria;
  index?: number;
  suggestionRef?: string;
  /** 顶部输入框开始新的一轮，不带上一轮的上下文与条件。 */
  fresh?: boolean;
}

/** 页面读取的任务、草稿、绑定与提交入口；全部只存在于当前发现页。 */
export interface DiscoveryState {
  entry: DiscoveryEntryResponse | undefined;
  entryError: string;
  entryErrorProps: ApiErrorContext | undefined;
  reloadEntry: () => void;
  draft: string;
  setDraft: (value: string, suggestion?: { suggestion_ref: string } | null) => void;
  follow: string;
  setFollow: (value: string) => void;
  modeChanged: boolean;
  canContinue: boolean;
  task: DiscoveryTask | undefined;
  status: 'idle' | 'thinking' | 'stopped';
  progress: DiscoveryProgress | undefined;
  /** 正在提问的原文；结果返回前显示在面板顶部，返回后以本轮结果的问题为准。 */
  asking: string;
  error: { message: string; request: Request } | undefined;
  notice: string;
  /** 不传参数时提交草稿；传入开场提问时先把它填进输入框，再带着提示标识提交。 */
  submit: (suggestion?: { text: string; suggestion_ref: string }) => void;
  followUp: () => void;
  applyFilter: (patch: Partial<DiscoveryCriteria>) => void;
  pick: (direction: DiscoveryDirectionResponse) => void;
  stop: () => void;
  retry: () => void;
  criteria: DiscoveryCriteria;
}

const emptyCriteria: DiscoveryCriteria = {
  keywords: [],
  requirements: [],
  kind: null,
  category: null,
  scenario_id: null,
  audience: 'readable',
  has_scripts: null,
  sort: 'relevance',
};

/**
 * 首页任务状态：入口模式与访客标记、草稿绑定、显式提交、停止与重试。
 * 不写本地存储、不建聊天历史；身份变化清除旧草稿与结果，模式变化要用户再确认一次才发送。
 */
export function useDiscovery(refresh: number): DiscoveryState {
  const [round, setRound] = useState(0);
  const {
    data: entryData,
    error: entryError,
    errorProps: entryErrorProps,
    loading: entryLoading,
  } = useQuery<DiscoveryEntryResponse>('/api/catalog/discovery', refresh + round);
  const entry = entryLoading || entryError ? undefined : entryData;
  const [{ text: draft, suggestionRef }, setDraftState] = useState<{
    text: string;
    suggestionRef?: string;
  }>({ text: '' });
  const [follow, setFollowState] = useState('');
  const [bound, setBound] = useState<{ mode: DiscoveryEntryResponse['mode']; viewerKey: string }>();
  const [task, setTask] = useState<DiscoveryTask>();
  const [status, setStatus] = useState<'idle' | 'thinking' | 'stopped'>('idle');
  const [error, setError] = useState<{ message: string; request: Request }>();
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<DiscoveryProgress>();
  const [asking, setAsking] = useState('');
  const request = useRef<AbortController | undefined>(undefined);
  const modeConfirmed = useRef(false);
  const viewerKey = entry?.viewer_key;
  const mode = entry?.mode;
  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = undefined;
  }, []);

  // 换账号、会话过期或退出后不转交旧草稿、条件和结果。
  const discardViewer = useCallback(
    (message: string) => {
      cancel();
      setBound(undefined);
      setDraftState({ text: '' });
      setFollowState('');
      setTask(undefined);
      setError(undefined);
      setStatus('idle');
      setProgress(undefined);
      setAsking('');
      setNotice(message);
    },
    [cancel],
  );
  useLayoutEffect(() => {
    if (!entry) return;
    if (bound && bound.viewerKey !== entry.viewer_key)
      discardViewer('登录状态已变化，上一轮的问题和结果已清除。');
    else if (!bound && draft) setBound({ mode: entry.mode, viewerKey: entry.viewer_key });
  }, [bound, draft, entry, discardViewer]);
  const modeChanged = !!bound && !!entry && bound.viewerKey === viewerKey && bound.mode !== mode;
  const canContinue =
    !!task?.context && mode === 'dialogue' && bound?.viewerKey === viewerKey && !modeChanged;
  useEffect(() => {
    modeConfirmed.current = false;
    if (!modeChanged) return;
    cancel();
    setTask(undefined);
    setError(undefined);
    setFollowState('');
    setStatus('idle');
    setProgress(undefined);
    setAsking('');
    setNotice(
      mode === 'dialogue'
        ? '本站已启用对话式发现。再次发送时，问题会交由本站配置的模型处理，勿填凭据。'
        : '本站当前没有可用模型。再次发送时改为关键词匹配，不会询问模型。',
    );
  }, [mode, modeChanged, cancel]);
  const setDraft = useCallback((value: string, suggestion?: { suggestion_ref: string } | null) => {
    setDraftState((previous) => ({
      text: value,
      suggestionRef:
        suggestion !== undefined || !value.trim()
          ? suggestion?.suggestion_ref
          : previous.suggestionRef,
    }));
  }, []);
  const run = useCallback(
    async (next: Request) => {
      if (!entry || request.current || (bound && bound.viewerKey !== entry.viewer_key)) return;
      if (!next.fresh && !canContinue) return;
      if (modeChanged && !modeConfirmed.current) {
        modeConfirmed.current = true;
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      setStatus('thinking');
      setError(undefined);
      setNotice('');
      setAsking(next.action === 'message' ? (next.text ?? '') : '');
      const binding = { mode: entry.mode, viewerKey: entry.viewer_key };
      setBound(binding);
      try {
        const body = {
          action: next.action,
          expected_mode: binding.mode,
          viewer_key: binding.viewerKey,
          ...(next.action === 'message'
            ? {
                text: next.text,
                ...(binding.mode === 'dialogue' && next.suggestionRef
                  ? { suggestion_ref: next.suggestionRef }
                  : {}),
              }
            : next.action === 'direction'
              ? { index: next.index }
              : { criteria: next.criteria }),
          ...(task?.context && !next.fresh ? { context: task.context } : {}),
        };
        let response: DiscoveryTurnResponse | undefined;
        if (next.action === 'message' && binding.mode === 'dialogue') {
          setProgress({ stage: 'start' });
          await postEvents(
            '/api/catalog/discovery/turn',
            body,
            (event) => {
              if (controller.signal.aborted) return;
              if (event.event === 'stage') {
                const stage = discoveryStageEventSchema.safeParse(event.data);
                if (!stage.success) throw new ApiError(502, 'STREAM_INVALID', '检索进度无效');
                setProgress((current) => ({ ...current, ...stage.data }));
              } else if (event.event === 'result') response = event.data as DiscoveryTurnResponse;
            },
            controller.signal,
          );
        } else
          response = await api<DiscoveryTurnResponse>('/api/catalog/discovery/turn', {
            method: 'POST',
            signal: controller.signal,
            body: JSON.stringify(body),
          });
        if (controller.signal.aborted) return;
        if (!response) throw new ApiError(502, 'STREAM_INCOMPLETE', '回应中断，请重试');
        setTask(toTask(response, next, task?.question ?? ''));
        setStatus('idle');
        setProgress(undefined);
        setAsking('');
        setFollowState('');
      } catch (failure) {
        if (controller.signal.aborted) return;
        setProgress(undefined);
        setAsking('');
        if (failure instanceof ApiError) {
          if (failure.code === 'DISCOVERY_VIEWER_CHANGED') {
            setRound((value) => value + 1);
            discardViewer(failure.message);
            return;
          }
          if (failure.code === 'DISCOVERY_MODE_CHANGED') {
            setRound((value) => value + 1);
            setNotice(failure.message);
            setStatus('idle');
            return;
          }
          if (failure.code === 'DISCOVERY_BASIS_UNAVAILABLE') {
            setRound((value) => value + 1);
            setTask(undefined);
            setFollowState('');
            if (next.suggestionRef)
              setDraftState((current) =>
                current.suggestionRef === next.suggestionRef ? { text: '' } : current,
              );
            setStatus('idle');
            setNotice(failure.message);
            return;
          }
        }
        setError({
          message: failure instanceof Error ? failure.message : '请求未完成，请重试',
          request: next,
        });
        setStatus('idle');
      } finally {
        if (request.current === controller) request.current = undefined;
      }
    },
    [entry, bound, canContinue, discardViewer, modeChanged, task?.context, task?.question],
  );
  const submit = useCallback(
    (suggestion?: { text: string; suggestion_ref: string }) => {
      const value = (suggestion?.text ?? draft).trim();
      const ref = suggestion ? suggestion.suggestion_ref : suggestionRef;
      if (!value || !entry || status === 'thinking') return;
      if (suggestion) setDraftState({ text: suggestion.text, suggestionRef: ref });
      setFollowState('');
      void run({
        action: 'message',
        text: value,
        fresh: true,
        ...(ref ? { suggestionRef: ref } : {}),
      });
    },
    [draft, entry, run, status, suggestionRef],
  );
  // 追问、改条件和选方向都接着本轮，不改写顶部输入框：那里只用于开始新的一轮。
  const followUp = useCallback(() => {
    const value = follow.trim();
    if (!value || status === 'thinking') return;
    void run({ action: 'message', text: value });
  }, [follow, run, status]);
  const applyFilter = useCallback(
    (patch: Partial<DiscoveryCriteria>) => {
      if (!task) return;
      void run({ action: 'filter', criteria: { ...task.criteria, ...patch } });
    },
    [run, task],
  );
  const pick = useCallback(
    (direction: DiscoveryDirectionResponse) => {
      const index = task?.directions.indexOf(direction) ?? -1;
      if (index < 0) return;
      void run({ action: 'direction', index: index + 1 });
    },
    [run, task],
  );
  const stop = useCallback(() => {
    cancel();
    setStatus('stopped');
    setProgress(undefined);
    setAsking('');
    setNotice('已停止本轮，可以修改问题后重新发送。');
  }, [cancel]);
  const retry = useCallback(() => {
    if (error) void run(error.request);
  }, [error, run]);
  useEffect(() => cancel, [cancel]);
  return {
    entry,
    entryError,
    entryErrorProps,
    reloadEntry: () => setRound((value) => value + 1),
    draft,
    setDraft,
    follow,
    setFollow: setFollowState,
    modeChanged,
    canContinue,
    task,
    status,
    progress,
    asking,
    error,
    notice,
    submit,
    followUp,
    applyFilter,
    pick,
    stop,
    retry,
    criteria: task?.criteria ?? emptyCriteria,
  };
}

function toTask(
  response: DiscoveryTurnResponse,
  request: Request,
  previousQuestion: string,
): DiscoveryTask {
  const question =
    request.action === 'message' ? (request.text ?? previousQuestion) : previousQuestion;
  if (response.mode === 'keywords')
    return {
      kind: 'matches',
      reply: '',
      goal: null,
      criteria: emptyCriteria,
      context: null,
      directions: [],
      items: response.items,
      partial: [],
      missing: [],
      reference: null,
      total: response.total,
      question,
    };
  return {
    kind: response.type,
    reply: response.reply,
    goal: response.goal,
    criteria: response.criteria,
    context: response.context,
    directions: response.type === 'guide' ? response.directions : [],
    items: response.type === 'reference' ? [] : response.items,
    partial: response.type === 'matches' ? response.partial : [],
    missing: response.type === 'matches' ? response.missing : [],
    reference: response.type === 'reference' ? response.item : null,
    total: response.type === 'matches' ? response.total : 0,
    question,
  };
}
