import { ExternalLink } from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { useBalances } from '@/hooks/useBalances';
import { TaskProgress } from '@/components/tasks/TaskProgress';
import { useI18n } from '@/lib/i18n';
import { formatDecimalString } from '@/utils/formatters';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { balances, isLoading: isLoadingBalances } = useBalances();
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('page.dashboard.title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t('page.dashboard.subtitle')}</p>
      </div>

      <TaskProgress />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{t('page.dashboard.yourTokens')}</h2>
          <a
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#2F6E0C] hover:underline dark:text-[#66D121]"
            href={`${tempoTestnet.blockExplorers.default.url}/address/${address ?? ''}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('page.dashboard.openWallet')}
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        {!isConnected ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            {t('page.common.connectToViewBalances')}
          </div>
        ) : chainId !== tempoTestnet.id ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            {t('page.common.switchNetworkToContinue', { network: tempoTestnet.name })}
          </div>
        ) : isLoadingBalances ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            {t('page.common.loadingBalances')}
          </div>
        ) : balances.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            {t('page.common.noBalancesFound')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {balances.map((b) => {
              const formattedValue = formatDecimalString(b.value, { maxFractionDigits: 2, minFractionDigits: 2 });
              return (
                <div
                  key={b.key}
                  className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xl font-semibold leading-tight">{b.symbol ?? b.name ?? b.label}</div>
                      <div className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{formattedValue}</div>
                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {t('page.dashboard.approxUsd', { value: formattedValue })}
                      </div>
                      <div className="mt-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                        {truncateAddress(b.tokenAddress)}
                      </div>
                    </div>

                    <a
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                      href={`${tempoTestnet.blockExplorers.default.url}/address/${b.tokenAddress}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('page.common.explorer')}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {chainId === tempoTestnet.id ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-300">
            {t('page.dashboard.nativeBalanceNotePrefix')}{' '}
            <span className="font-mono">eth_getBalance</span>. {t('page.dashboard.nativeBalanceNoteSuffix')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
