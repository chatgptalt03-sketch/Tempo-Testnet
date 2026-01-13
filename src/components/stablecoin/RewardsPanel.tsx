import { useMemo, useState } from 'react';
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useSearchParams } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { formatUnits, isAddress, parseUnits } from 'viem';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { ABIS } from '@/contracts/abis';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { parseContractError } from '@/utils/errorParser';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

type Address = `0x${string}`;

export function RewardsPanel() {
  const { t } = useI18n();
  const chainId = useChainId();
  const isTempo = chainId === tempoTestnet.id;
  const { address, isConnected } = useAccount();
  const [searchParams] = useSearchParams();

  const token = (searchParams.get('token') ?? '').trim();
  const tokenAddress = isAddress(token) ? (token as Address) : null;

  const { data: symbol } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'symbol',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });
  const { data: decimals } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'decimals',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });

  const { data: globalRewardPerToken } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'globalRewardPerToken',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });

  const { data: optedInSupply } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'optedInSupply',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });

  const { data: userRewardInfo } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'userRewardInfo',
    args: address && tokenAddress ? [address] : undefined,
    query: { enabled: Boolean(isTempo && tokenAddress && address) },
  });

  const d = typeof decimals === 'number' ? decimals : 6;
  const s = typeof symbol === 'string' ? symbol : 'TOKEN';

  const rewardRecipient = (userRewardInfo as { rewardRecipient?: Address } | undefined)?.rewardRecipient;
  const rewardBalance = (userRewardInfo as { rewardBalance?: bigint } | undefined)?.rewardBalance;

  const [recipient, setRecipient] = useState('');
  const effectiveRecipient = useMemo(() => {
    const raw = recipient.trim();
    if (!raw) return address ?? null;
    return isAddress(raw) ? (raw as Address) : null;
  }, [recipient, address]);

  const [distributeAmount, setDistributeAmount] = useState('');

  const {
    data: setRecipientHash,
    writeContract: writeSetRecipient,
    isPending: isSetRecipientPending,
    error: setRecipientError,
  } = useWriteContract();
  const setRecipientReceipt = useWaitForTransactionReceipt({ hash: setRecipientHash });

  const {
    data: distributeHash,
    writeContract: writeDistribute,
    isPending: isDistributePending,
    error: distributeError,
  } = useWriteContract();
  const distributeReceipt = useWaitForTransactionReceipt({ hash: distributeHash });

  const {
    data: claimHash,
    writeContract: writeClaim,
    isPending: isClaimPending,
    error: claimError,
  } = useWriteContract();
  const claimReceipt = useWaitForTransactionReceipt({ hash: claimHash });

  if (!tokenAddress) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
        {t('issuance.rewards.enterAddress')}
      </div>
    );
  }

  const setRewardRecipient = async () => {
    if (!effectiveRecipient) return;
    writeSetRecipient({
      address: tokenAddress,
      abi: ABIS.TIP20Token,
      functionName: 'setRewardRecipient',
      args: [effectiveRecipient],
    });
  };

  const distributeReward = async () => {
    if (!distributeAmount.trim()) return;
    const value = parseUnits(distributeAmount, d);
    writeDistribute({
      address: tokenAddress,
      abi: ABIS.TIP20Token,
      functionName: 'distributeReward',
      args: [value],
    });
  };

  const claimRewards = async () => {
    writeClaim({
      address: tokenAddress,
      abi: ABIS.TIP20Token,
      functionName: 'claimRewards',
      args: [],
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center gap-2">
          <Gift className="h-6 w-6 text-purple-500" />
          <h2 className="text-xl font-bold">{t('issuance.rewards.title')}</h2>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400">
          {t('issuance.rewards.tokenLabel')} <span className="font-mono text-xs">{tokenAddress}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-800">
            <div className="text-gray-600 dark:text-gray-300">{t('issuance.rewards.optedInSupply')}</div>
            <div className="mt-1 font-mono text-gray-900 dark:text-gray-100">
              {typeof optedInSupply === 'bigint' ? formatUnits(optedInSupply, d) : '—'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-800">
            <div className="text-gray-600 dark:text-gray-300">{t('issuance.rewards.globalRewardPerToken')}</div>
            <div className="mt-1 font-mono text-gray-900 dark:text-gray-100">
              {typeof globalRewardPerToken === 'bigint' ? globalRewardPerToken.toString() : '—'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-800">
            <div className="text-gray-600 dark:text-gray-300">{t('issuance.rewards.myRewards')}</div>
            <div className="mt-1 font-mono text-gray-900 dark:text-gray-100">
              {typeof rewardBalance === 'bigint' ? `${formatUnits(rewardBalance, d)} ${s}` : '—'}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="text-lg font-bold">{t('issuance.rewards.optInRecipientTitle')}</h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {t('issuance.rewards.optInRecipientHelp')}
            </p>
            <label className="mt-3 block text-sm font-medium">{t('issuance.rewards.recipientOptional')}</label>
            <Input
              className={cn('mt-2 font-mono', recipient.trim().length === 0 || effectiveRecipient ? '' : 'border-red-400')}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={address ?? '0x...'}
            />
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {t('issuance.rewards.current')} <span className="font-mono">{rewardRecipient ?? '—'}</span>
            </div>

            {setRecipientError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                {parseContractError(setRecipientError)}
              </div>
            ) : null}

            <Button
              type="button"
              className="mt-4"
              onClick={setRewardRecipient}
              disabled={!isConnected || !isTempo || !effectiveRecipient || isSetRecipientPending}
            >
              {isSetRecipientPending ? t('common.submitting') : t('issuance.rewards.setRecipient')}
            </Button>
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {t('common.status')}{' '}
              {setRecipientReceipt.isLoading ? t('common.confirming') : setRecipientReceipt.isSuccess ? t('common.confirmed') : '—'}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="text-lg font-bold">{t('issuance.rewards.distributeClaimTitle')}</h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {t('issuance.rewards.distributeClaimHelp')}
            </p>

            <label className="mt-3 block text-sm font-medium">{t('issuance.rewards.distributeAmount', { symbol: s })}</label>
            <Input value={distributeAmount} onChange={(e) => setDistributeAmount(e.target.value)} placeholder="100" className="mt-2" />

            {distributeError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                {parseContractError(distributeError)}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={distributeReward}
                disabled={!isConnected || !isTempo || !distributeAmount.trim() || isDistributePending}
              >
                {isDistributePending ? t('common.submitting') : t('issuance.rewards.distribute')}
              </Button>

              <Button type="button" variant="outline" onClick={claimRewards} disabled={!isConnected || !isTempo || isClaimPending}>
                {isClaimPending ? t('common.submitting') : t('issuance.rewards.claim')}
              </Button>
            </div>

            {claimError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                {parseContractError(claimError)}
              </div>
            ) : null}

            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {t('issuance.rewards.distributeStatus', {
                status: distributeReceipt.isLoading ? t('common.confirming') : distributeReceipt.isSuccess ? t('common.confirmed') : '—',
              })}{' '}
              |{' '}
              {t('issuance.rewards.claimStatus', {
                status: claimReceipt.isLoading ? t('common.confirming') : claimReceipt.isSuccess ? t('common.confirmed') : '—',
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
