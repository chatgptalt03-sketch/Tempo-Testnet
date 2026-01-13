import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { isAddress } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addRecentToken, loadRecentTokens, removeRecentToken, subscribeRecentTokensUpdates } from '@/lib/recentTokens';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Address = `0x${string}`;

export function ImportToken() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { t } = useI18n();
  const [tokenInput, setTokenInput] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!isConnected || !address) {
      setRecent([]);
      return;
    }

    const load = () => setRecent(loadRecentTokens(chainId, address).tokens);
    load();
    return subscribeRecentTokensUpdates(load);
  }, [address, chainId, isConnected]);

  const normalized = tokenInput.trim();
  const valid = useMemo(() => (normalized.length ? isAddress(normalized) : false), [normalized]);

  const add = () => {
    if (!address || !isConnected) return;
    if (!valid) return;
    addRecentToken(chainId, address, normalized);
    setTokenInput('');
  };

  const remove = (token: string) => {
    if (!address || !isConnected) return;
    removeRecentToken(chainId, address, token);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="text-sm font-semibold">{t('page.tokens.import.title')}</div>
      <div className="mt-2 flex gap-2">
        <Input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder={t('page.tokens.import.placeholder')}
          className={cn('font-mono', tokenInput.trim().length === 0 || valid ? '' : 'border-red-400')}
        />
        <Button type="button" onClick={add} disabled={!isConnected || !address || !valid}>
          {t('page.tokens.import.add')}
        </Button>
      </div>
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        {t('page.tokens.import.help')}
      </p>

      {recent.length ? (
        <div className="mt-3 space-y-2">
          {recent.map((token) => (
            <div
              key={token.toLowerCase()}
              className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 dark:border-gray-800"
            >
              <div className="min-w-0 flex-1 font-mono text-xs text-gray-700 truncate dark:text-gray-300">
                {token as Address}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => remove(token)} className="shrink-0">
                {t('page.tokens.import.remove')}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
