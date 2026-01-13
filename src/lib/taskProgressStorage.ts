import type { TaskKey } from '@/lib/tasks';

type TaskProgressState = {
  daily: Partial<Record<TaskKey, string>>;
  once: Partial<Record<TaskKey, true>>;
  lastTransferTx?: string;
};

const STORAGE_PREFIX = 'tempo:testnet:taskProgress';

const TASK_PROGRESS_EVENT = 'tempo:taskProgressUpdated';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function storageKey(chainId: number, address: string): string {
  return `${STORAGE_PREFIX}:${chainId}:${address.toLowerCase()}`;
}

export function loadTaskProgress(chainId: number, address: string): TaskProgressState {
  try {
    const raw = window.localStorage.getItem(storageKey(chainId, address));
    if (!raw) return { daily: {}, once: {} };
    const parsed = JSON.parse(raw) as TaskProgressState;
    return {
      daily: parsed?.daily ?? {},
      once: parsed?.once ?? {},
      lastTransferTx: parsed?.lastTransferTx,
    };
  } catch {
    return { daily: {}, once: {} };
  }
}

export function saveTaskProgress(chainId: number, address: string, state: TaskProgressState): void {
  window.localStorage.setItem(storageKey(chainId, address), JSON.stringify(state));
}

export function isTaskCompletedToday(state: TaskProgressState, key: TaskKey): boolean {
  return state.daily?.[key] === todayUtc();
}

export function isTaskCompletedOnce(state: TaskProgressState, key: TaskKey): boolean {
  return state.once?.[key] === true;
}

export function markTaskCompleted(
  chainId: number,
  address: string,
  key: TaskKey,
  opts?: { txHash?: string },
): void {
  const state = loadTaskProgress(chainId, address);

  if (key.endsWith('_daily')) {
    state.daily[key] = todayUtc();
  } else {
    state.once[key] = true;
  }

  if (opts?.txHash) state.lastTransferTx = opts.txHash;

  saveTaskProgress(chainId, address, state);

  // Notify the app (same-tab) so task UI updates immediately.
  window.dispatchEvent(
    new CustomEvent(TASK_PROGRESS_EVENT, {
      detail: { chainId, address: address.toLowerCase(), key },
    }),
  );
}

export function subscribeTaskProgressUpdates(onUpdate: () => void): () => void {
  const handleCustom = () => onUpdate();
  const handleStorage = (e: StorageEvent) => {
    if (!e.key) return;
    if (!e.key.startsWith(STORAGE_PREFIX)) return;
    onUpdate();
  };

  window.addEventListener(TASK_PROGRESS_EVENT, handleCustom as EventListener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(TASK_PROGRESS_EVENT, handleCustom as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
}
