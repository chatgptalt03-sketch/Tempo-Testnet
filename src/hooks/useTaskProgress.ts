import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { TASK_DEFINITIONS, type TaskKey } from '@/lib/tasks';
import { useI18n } from '@/lib/i18n';
import {
  isTaskCompletedOnce,
  isTaskCompletedToday,
  loadTaskProgress,
  subscribeTaskProgressUpdates,
} from '@/lib/taskProgressStorage';

export type TaskRow = {
  key: TaskKey;
  name: string;
  description: string;
  href: string;
  cadence: 'daily' | 'once';
  enabled: boolean;
  completed: boolean;
};

export function useTaskProgress() {
  const { t: tr } = useI18n();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeTaskProgressUpdates(() => setVersion((v) => v + 1));
  }, []);

  const tasks = useMemo(() => {
    // Recompute when task progress storage changes.
    void version;
    if (!address || !isConnected) {
      return TASK_DEFINITIONS.map((def) => ({
        key: def.key,
        name: tr(def.nameKey),
        description: tr(def.descriptionKey),
        href: def.href,
        cadence: def.cadence,
        enabled: def.enabled,
        completed: false,
      })) as TaskRow[];
    }

    const state = loadTaskProgress(chainId, address);
    return TASK_DEFINITIONS.map((def) => {
      const completed = def.cadence === 'daily'
        ? isTaskCompletedToday(state, def.key)
        : isTaskCompletedOnce(state, def.key);

      return {
        key: def.key,
        name: tr(def.nameKey),
        description: tr(def.descriptionKey),
        href: def.href,
        cadence: def.cadence,
        enabled: def.enabled,
        completed,
      };
    }) as TaskRow[];
  }, [address, isConnected, chainId, version, tr]);

  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return {
    tasks,
    completedCount,
    totalCount,
    progress,
  } as const;
}
