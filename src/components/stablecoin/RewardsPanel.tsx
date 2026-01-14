import { useEffect, useMemo, useState } from 'react';
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
type Hex = `0x${string}`;

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

  const { data: globalRewardPerToken, refetch: refetchGlobalRewardPerToken } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'globalRewardPerToken',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });

  const { data: optedInSupply, refetch: refetchOptedInSupply } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'optedInSupply',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });

  const { data: userRewardInfo, refetch: refetchUserRewardInfo } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'userRewardInfo',
    args: address && tokenAddress ? [address] : undefined,
    query: { enabled: Boolean(isTempo && tokenAddress && address) },
  });

  const d = useMemo(() => {
    if (typeof decimals === 'number') return decimals;
    if (typeof decimals === 'bigint') {
      const n = Number(decimals);
      return Number.isFinite(n) && n >= 0 ? n : 6;
    }
    return 6;
  }, [decimals]);
  const s = typeof symbol === 'string' ? symbol : 'TOKEN';

  const optedInSupplyValue = typeof optedInSupply === 'bigint' ? optedInSupply : null;
  const noOptedInSupply = optedInSupplyValue === 0n;

  const { rewardRecipient, rewardPerToken, rewardBalance } = useMemo(() => {
    // viem may return tuples as arrays at runtime even though TS exposes named fields.
    // TIP20Token.userRewardInfo returns: (rewardRecipient, rewardPerToken, rewardBalance)
    const info = userRewardInfo as unknown;
    if (!info)
      return {
        rewardRecipient: undefined as Address | undefined,
        rewardPerToken: undefined as bigint | undefined,
        rewardBalance: undefined as bigint | undefined,
      };

    if (Array.isArray(info)) {
      const arr = info as unknown[];
      const maybeRecipient = arr[0];
      const maybeRewardPerToken = arr[1];
      const maybeBalance = arr[2];
      return {
        rewardRecipient: typeof maybeRecipient === 'string' ? (maybeRecipient as Address) : undefined,
        rewardPerToken: typeof maybeRewardPerToken === 'bigint' ? maybeRewardPerToken : undefined,
        rewardBalance: typeof maybeBalance === 'bigint' ? maybeBalance : undefined,
      };
    }

    if (typeof info === 'object') {
      const obj = info as { rewardRecipient?: Address; rewardPerToken?: bigint; rewardBalance?: bigint };
      return {
        rewardRecipient: obj.rewardRecipient,
        rewardPerToken: obj.rewardPerToken,
        rewardBalance: obj.rewardBalance,
      };
    }

    return {
      rewardRecipient: undefined as Address | undefined,
      rewardPerToken: undefined as bigint | undefined,
      rewardBalance: undefined as bigint | undefined,
    };
  }, [userRewardInfo]);

  const [recipient, setRecipient] = useState('');
  const effectiveRecipient = useMemo(() => {
    const raw = recipient.trim();
    if (!raw) return address ?? null;
    return isAddress(raw) ? (raw as Address) : null;
  }, [recipient, address]);

  const [distributeAmount, setDistributeAmount] = useState('');
  const [distributeInputError, setDistributeInputError] = useState<string | null>(null);

  const { data: paused, refetch: refetchPaused } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'paused',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });

  const { data: issuerRole } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'ISSUER_ROLE',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });

  const { data: adminRole } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'DEFAULT_ADMIN_ROLE',
    query: { enabled: Boolean(isTempo && tokenAddress) },
  });

  const { data: isIssuer } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'hasRole',
    args:
      address && tokenAddress && typeof issuerRole === 'string'
        ? [address, issuerRole as Hex]
        : undefined,
    query: { enabled: Boolean(isTempo && tokenAddress && address && typeof issuerRole === 'string') },
  });

  const { data: isAdmin } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'hasRole',
    args:
      address && tokenAddress && typeof adminRole === 'string'
        ? [address, adminRole as Hex]
        : undefined,
    query: { enabled: Boolean(isTempo && tokenAddress && address && typeof adminRole === 'string') },
  });

  const canDistribute = Boolean(isIssuer || isAdmin);

  const { data: myBalance, refetch: refetchMyBalance } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: ABIS.TIP20Token,
    functionName: 'balanceOf',
    args: address && tokenAddress ? [address] : undefined,
    query: { enabled: Boolean(isTempo && tokenAddress && address) },
  });

  const estimatedClaimableRewards = useMemo(() => {
    // Standard reward-per-token accumulator pattern:
    // claimable = storedRewardBalance + balance * (globalRewardPerToken - userRewardPerToken) / 1e18
    if (typeof myBalance !== 'bigint') return null;
    if (typeof globalRewardPerToken !== 'bigint') return null;
    if (typeof rewardPerToken !== 'bigint') return null;
    const delta = globalRewardPerToken > rewardPerToken ? globalRewardPerToken - rewardPerToken : 0n;
    const SCALE = 10n ** 18n;
    const pending = (myBalance * delta) / SCALE;
    const stored = typeof rewardBalance === 'bigint' ? rewardBalance : 0n;
    return stored + pending;
  }, [globalRewardPerToken, myBalance, rewardBalance, rewardPerToken]);

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

  const explorerBase = tempoTestnet.blockExplorers?.default?.url ?? '';

  const refreshAll = async () => {
    if (!isTempo || !tokenAddress) return;
    await Promise.allSettled([
      refetchOptedInSupply(),
      refetchGlobalRewardPerToken(),
      refetchPaused(),
      refetchMyBalance(),
      address ? refetchUserRewardInfo() : Promise.resolve(null),
    ]);
  };

  useEffect(() => {
    if (setRecipientReceipt.isSuccess) {
      setRecipient('');
      void refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRecipientReceipt.isSuccess]);

  useEffect(() => {
    if (distributeReceipt.isSuccess) void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributeReceipt.isSuccess]);

  useEffect(() => {
    if (claimReceipt.isSuccess) void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimReceipt.isSuccess]);

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
    setDistributeInputError(null);
    if (!distributeAmount.trim()) return;
    if (!canDistribute) {
      setDistributeInputError(t('issuance.rewards.notAuthorized'));
      return;
    }

    if (noOptedInSupply) {
      setDistributeInputError(t('issuance.rewards.noOptedInSupplyError'));
      return;
    }

    let value: bigint;
    try {
      value = parseUnits(distributeAmount, d);
    } catch {
      setDistributeInputError(t('common.enterValidAmount'));
      return;
    }

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
              {typeof estimatedClaimableRewards === 'bigint'
                ? `${formatUnits(estimatedClaimableRewards, d)} ${s}`
                : typeof rewardBalance === 'bigint'
                  ? `${formatUnits(rewardBalance, d)} ${s}`
                  : '—'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {t('issuance.rewards.myRewardsHint')}
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
          {typeof myBalance === 'bigint'
            ? t('issuance.rewards.yourBalance', { amount: formatUnits(myBalance, d), symbol: s })
            : null}
          {typeof paused === 'boolean' && paused ? (
            <span className={cn(typeof myBalance === 'bigint' ? 'ml-2' : '', 'text-yellow-700 dark:text-yellow-300')}>
              {t('issuance.rewards.pausedWarning')}
            </span>
          ) : null}
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

            {explorerBase && setRecipientHash ? (
              <a
                className="mt-1 inline-block text-xs font-medium text-[#2F6E0C] hover:underline dark:text-[#66D121]"
                href={`${explorerBase}/tx/${setRecipientHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {t('issuance.rewards.viewTxOnExplorer')}
              </a>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 className="text-lg font-bold">{t('issuance.rewards.distributeClaimTitle')}</h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {t('issuance.rewards.distributeClaimHelp')}
            </p>

            {noOptedInSupply ? (
              <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
                {t('issuance.rewards.noOptedInSupplyHint')}
              </div>
            ) : null}

            {isConnected && isTempo && !canDistribute ? (
              <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
                {t('issuance.rewards.notAuthorized')}
              </div>
            ) : null}

            <label className="mt-3 block text-sm font-medium">{t('issuance.rewards.distributeAmount', { symbol: s })}</label>
            <Input
              value={distributeAmount}
              onChange={(e) => {
                setDistributeAmount(e.target.value);
                if (distributeInputError) setDistributeInputError(null);
              }}
              placeholder="100"
              className={cn('mt-2', distributeInputError ? 'border-red-400' : '')}
            />

            {distributeInputError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                {distributeInputError}
              </div>
            ) : null}

            {distributeError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                {parseContractError(distributeError)}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={distributeReward}
                disabled={
                  !isConnected ||
                  !isTempo ||
                  !distributeAmount.trim() ||
                  isDistributePending ||
                  (typeof paused === 'boolean' && paused) ||
                  noOptedInSupply
                }
              >
                {isDistributePending ? t('common.submitting') : t('issuance.rewards.distribute')}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={claimRewards}
                disabled={!isConnected || !isTempo || isClaimPending || (typeof paused === 'boolean' && paused)}
              >
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

            {explorerBase && (distributeHash || claimHash) ? (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {distributeHash ? (
                  <a
                    className="font-medium text-[#2F6E0C] hover:underline dark:text-[#66D121]"
                    href={`${explorerBase}/tx/${distributeHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('issuance.rewards.viewDistributeOnExplorer')}
                  </a>
                ) : null}
                {claimHash ? (
                  <a
                    className="font-medium text-[#2F6E0C] hover:underline dark:text-[#66D121]"
                    href={`${explorerBase}/tx/${claimHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('issuance.rewards.viewClaimOnExplorer')}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
