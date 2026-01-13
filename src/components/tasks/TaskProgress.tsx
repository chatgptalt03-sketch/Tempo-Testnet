import { CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTaskProgress } from '@/hooks/useTaskProgress';
import { useI18n } from '@/lib/i18n';

export function TaskProgress() {
  const { t } = useI18n();
  const { tasks, completedCount, totalCount, progress } = useTaskProgress();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t('tasks.dailyTitle')}</h2>
        <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {completedCount} / {totalCount}
        </div>
      </div>

      <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
            className="h-full rounded-full bg-[#66D121]"
          style={{ width: `${progress}%` }}
          aria-label={t('tasks.progressAria', { progress })}
        />
      </div>

      <div className="space-y-2">
        {tasks.map((task) => {
          const Icon = task.completed ? CheckCircle2 : Circle;
          return (
            <Link
              key={task.key}
              to={task.href}
              className={cn(
                'flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 transition-colors dark:border-gray-800',
                task.enabled ? 'hover:border-purple-500' : 'opacity-70',
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', task.completed ? 'text-green-500' : 'text-gray-400')} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{task.name}</div>
                  <div className="truncate text-sm text-gray-600 dark:text-gray-400">{task.description}</div>
                </div>
              </div>
              <div className="shrink-0">
                {task.completed ? (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/20 dark:text-green-200">
                    {t('tasks.status.completed')}
                  </span>
                ) : task.enabled ? (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {t('tasks.status.start')}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {t('tasks.status.comingSoon')}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
