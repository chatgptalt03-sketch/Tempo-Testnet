import { Coins } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useBalances } from '@/hooks/useBalances';
import { ImportToken } from '@/components/token/ImportToken';
import { formatTokenAmount } from '@/utils/formatters';
import { useI18n } from '@/lib/i18n';

export default function Tokens() {
  const { isConnected } = useAccount();
  const { balances, isLoading: isLoadingBalances } = useBalances();
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-bold">{t('page.tokens.yourBalances')}</h2>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          {!isConnected ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
              {t('page.common.connectToViewBalances')}
            </div>
          ) : (
            <div className="space-y-3">
              {isLoadingBalances ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
                  {t('page.common.loadingBalances')}
                </div>
              ) : balances.length ? (
                <div className="space-y-3">
                  {balances.map((b) => (
                    <div
                      key={b.key}
                      className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold">{b.symbol ?? b.label}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">{t('page.tokens.stablecoinTag')}</div>
                        </div>
                        <div className="font-mono text-base font-semibold whitespace-nowrap">
                          {formatTokenAmount(b.value)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
                  {t('page.common.noBalancesFound')}
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <ImportToken />
          </div>
      </div>
    </div>
  );
}
