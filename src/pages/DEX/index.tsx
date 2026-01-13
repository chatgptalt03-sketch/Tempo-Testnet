import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ExternalLink, Loader2 } from 'lucide-react';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { CONTRACTS } from '@/config/contracts';
import { TESTNET_ADDRESSES } from '@/contracts/addresses/testnet';
import { ABIS } from '@/contracts/abis';
import { loadRecentTokens, subscribeRecentTokensUpdates, addRecentToken } from '@/lib/recentTokens';
import {
  formatUnits,
  isAddress,
  parseUnits,
} from 'viem';
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { markTaskCompleted } from '@/lib/taskProgressStorage';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

const MAX_UINT128 = (1n << 128n) - 1n;

type TokenOption = {
  key: string;
  label: string;
  address: `0x${string}`;
};

type SwapMode = 'exactIn' | 'exactOut';

export default function DEX() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const dex = useMemo(() => CONTRACTS.find((c) => c.key === 'dex')?.address, []);

  const { t } = useI18n();

  const isTempo = chainId === tempoTestnet.id;

  const [recentVersion, setRecentVersion] = useState(0);
  useEffect(() => {
    return subscribeRecentTokensUpdates(() => setRecentVersion((v) => v + 1));
  }, []);

  const recentTokens = useMemo(() => {
    void recentVersion;
    if (!address) return [];
    return loadRecentTokens(tempoTestnet.id, address).tokens.filter((t) => isAddress(t));
  }, [address, recentVersion]);

  const tokenOptions = useMemo((): TokenOption[] => {
    const chain = (TESTNET_ADDRESSES as unknown as Record<number, Record<string, string>>)[tempoTestnet.id];
    const base: TokenOption[] = [
      { key: 'PathUSD', label: 'pathUSD', address: chain.PathUSD as `0x${string}` },
      { key: 'AlphaUSD', label: 'AlphaUSD', address: chain.AlphaUSD as `0x${string}` },
      { key: 'BetaUSD', label: 'BetaUSD', address: chain.BetaUSD as `0x${string}` },
      { key: 'ThetaUSD', label: 'ThetaUSD', address: chain.ThetaUSD as `0x${string}` },
    ];

    const seen = new Set(base.map((t) => t.address.toLowerCase()));
    const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
    const recent: TokenOption[] = recentTokens
      .filter((addr) => {
        const lower = addr.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      })
      .map((addr) => ({
        key: `recent:${addr.toLowerCase()}`,
        label: `${t('page.issuance.recentLocal')}: ${short(addr)}`,
        address: addr as `0x${string}`,
      }));

    return [...base, ...recent];
  }, [recentTokens, t]);

  const CUSTOM_KEY = '__custom__';
  const [tokenInKey, setTokenInKey] = useState<string>(() => tokenOptions[0]?.key ?? 'PathUSD');
  const [tokenOutKey, setTokenOutKey] = useState<string>(() => tokenOptions[1]?.key ?? 'AlphaUSD');
  const [customIn, setCustomIn] = useState('');
  const [customOut, setCustomOut] = useState('');

  const tokenInAddress = useMemo(() => {
    if (tokenInKey === CUSTOM_KEY) {
      return isAddress(customIn) ? (customIn as `0x${string}`) : null;
    }
    return tokenOptions.find((opt) => opt.key === tokenInKey)?.address ?? null;
  }, [customIn, tokenInKey, tokenOptions]);

  const tokenOutAddress = useMemo(() => {
    if (tokenOutKey === CUSTOM_KEY) {
      return isAddress(customOut) ? (customOut as `0x${string}`) : null;
    }
    return tokenOptions.find((opt) => opt.key === tokenOutKey)?.address ?? null;
  }, [customOut, tokenOutKey, tokenOptions]);

  useEffect(() => {
    if (!address) return;
    if (!isTempo) return;
    if (tokenInKey === CUSTOM_KEY && tokenInAddress) addRecentToken(tempoTestnet.id, address, tokenInAddress);
    if (tokenOutKey === CUSTOM_KEY && tokenOutAddress) addRecentToken(tempoTestnet.id, address, tokenOutAddress);
  }, [address, isTempo, tokenInAddress, tokenInKey, tokenOutAddress, tokenOutKey]);
  const [mode, setMode] = useState<SwapMode>('exactIn');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [slippageBps, setSlippageBps] = useState('50'); // 0.50%

  useEffect(() => {
    // Keep beginners on the simplest path.
    if (!advancedOpen && mode !== 'exactIn') setMode('exactIn');
  }, [advancedOpen, mode]);

  useEffect(() => {
    // Ensure tokenIn != tokenOut.
    if (!tokenInAddress || !tokenOutAddress) return;
    if (tokenInAddress === tokenOutAddress) {
      const next = tokenOptions.find((opt) => opt.address !== tokenInAddress);
      if (next) setTokenOutKey(next.key);
    }
  }, [tokenInAddress, tokenOutAddress, tokenOptions]);

  const { data: decimalsIn } = useReadContract({
    abi: ABIS.TIP20Token,
    address: tokenInAddress ?? undefined,
    functionName: 'decimals',
    query: { enabled: Boolean(isTempo && tokenInAddress) },
  });

  const { data: decimalsOut } = useReadContract({
    abi: ABIS.TIP20Token,
    address: tokenOutAddress ?? undefined,
    functionName: 'decimals',
    query: { enabled: Boolean(isTempo && tokenOutAddress) },
  });

  const amountInParsed = useMemo(() => {
    if (mode !== 'exactIn') return null;
    if (!amountIn.trim()) return null;
    const n = Number(amountIn);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = typeof decimalsIn === 'number' ? decimalsIn : 6;
    try {
      const v = parseUnits(amountIn, d);
      if (v <= 0n || v > MAX_UINT128) return null;
      return v;
    } catch {
      return null;
    }
  }, [amountIn, decimalsIn, mode]);

  const amountOutParsed = useMemo(() => {
    if (mode !== 'exactOut') return null;
    if (!amountOut.trim()) return null;
    const n = Number(amountOut);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = typeof decimalsOut === 'number' ? decimalsOut : 6;
    try {
      const v = parseUnits(amountOut, d);
      if (v <= 0n || v > MAX_UINT128) return null;
      return v;
    } catch {
      return null;
    }
  }, [amountOut, decimalsOut, mode]);

  const canQuoteExactIn = Boolean(
    mode === 'exactIn' &&
      isConnected &&
      isTempo &&
      dex &&
      amountInParsed &&
      tokenInAddress &&
      tokenOutAddress &&
      tokenInAddress !== tokenOutAddress,
  );

  const canQuoteExactOut = Boolean(
    mode === 'exactOut' &&
      isConnected &&
      isTempo &&
      dex &&
      amountOutParsed &&
      tokenInAddress &&
      tokenOutAddress &&
      tokenInAddress !== tokenOutAddress,
  );

  const { data: quotedOut } = useReadContract({
    abi: ABIS.StablecoinDEX,
    address: dex,
    functionName: 'quoteSwapExactAmountIn',
    args: canQuoteExactIn ? [tokenInAddress!, tokenOutAddress!, amountInParsed!] : undefined,
    query: { enabled: canQuoteExactIn },
  });

  const { data: quotedIn } = useReadContract({
    abi: ABIS.StablecoinDEX,
    address: dex,
    functionName: 'quoteSwapExactAmountOut',
    args: canQuoteExactOut ? [tokenInAddress!, tokenOutAddress!, amountOutParsed!] : undefined,
    query: { enabled: canQuoteExactOut },
  });

  const slippageBpsInt = useMemo(() => {
    const bps = Number(slippageBps);
    if (!Number.isFinite(bps) || bps < 0 || bps > 10_000) return null;
    return Math.floor(bps);
  }, [slippageBps]);

  const minOut = useMemo(() => {
    if (mode !== 'exactIn') return null;
    if (typeof quotedOut !== 'bigint') return null;
    if (slippageBpsInt == null) return null;
    const numerator = 10_000n - BigInt(slippageBpsInt);
    const v = (quotedOut * numerator) / 10_000n;
    if (v < 0n || v > MAX_UINT128) return null;
    return v;
  }, [mode, quotedOut, slippageBpsInt]);

  const maxIn = useMemo(() => {
    if (mode !== 'exactOut') return null;
    if (typeof quotedIn !== 'bigint') return null;
    if (slippageBpsInt == null) return null;
    const numerator = 10_000n + BigInt(slippageBpsInt);
    const v = (quotedIn * numerator) / 10_000n;
    if (v < 0n || v > MAX_UINT128) return null;
    return v;
  }, [mode, quotedIn, slippageBpsInt]);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: ABIS.TIP20Token,
    address: tokenInAddress ?? undefined,
    functionName: 'allowance',
    args: isConnected && address && dex && tokenInAddress ? [address, dex] : undefined,
    query: { enabled: Boolean(isTempo && isConnected && address && dex && tokenInAddress) },
  });

  const requiredForApproval = useMemo(() => {
    return mode === 'exactIn' ? amountInParsed : maxIn;
  }, [amountInParsed, maxIn, mode]);

  const needsApproval = useMemo(() => {
    const required = requiredForApproval;
    if (!required) return false;
    if (typeof allowance !== 'bigint') return true;
    return allowance < required;
  }, [allowance, requiredForApproval]);

  const {
    data: approveHash,
    writeContract: writeApprove,
    isPending: isApprovePending,
    error: approveError,
  } = useWriteContract();

  const {
    data: swapHash,
    writeContract: writeSwap,
    isPending: isSwapPending,
    error: swapError,
  } = useWriteContract();

  const approveReceipt = useWaitForTransactionReceipt({ hash: approveHash });
  const swapReceipt = useWaitForTransactionReceipt({ hash: swapHash });

  const approveContextRef = useRef<{
    tokenIn: `0x${string}`;
    spender: `0x${string}`;
    amount: bigint;
    hash?: `0x${string}`;
  } | null>(null);

  const approvalCoversCurrent = useMemo(() => {
    if (!approveReceipt.isSuccess) return false;
    if (!dex) return false;
    const ctx = approveContextRef.current;
    if (!ctx) return false;
    if (!approveHash || ctx.hash?.toLowerCase() !== approveHash.toLowerCase()) return false;
    if (!tokenInAddress) return false;
    if (ctx.tokenIn.toLowerCase() !== tokenInAddress.toLowerCase()) return false;
    if (ctx.spender.toLowerCase() !== dex.toLowerCase()) return false;
    if (!requiredForApproval) return false;
    return ctx.amount >= requiredForApproval;
  }, [approveHash, approveReceipt.isSuccess, dex, requiredForApproval, tokenInAddress]);

  useEffect(() => {
    // Avoid waiting for background cache refresh: once approval is mined, refetch allowance immediately.
    if (!approveReceipt.isSuccess) return;
    refetchAllowance();
  }, [approveReceipt.isSuccess, refetchAllowance]);

  useEffect(() => {
    if (!address) return;
    if (!swapHash) return;
    if (!swapReceipt.isSuccess) return;
    markTaskCompleted(tempoTestnet.id, address, 'swap_tokens_daily', { txHash: swapHash });
  }, [address, swapHash, swapReceipt.isSuccess]);

  const approve = async () => {
    if (!dex) return;
    if (!requiredForApproval) return;
    if (!tokenInAddress) return;

    approveContextRef.current = {
      tokenIn: tokenInAddress,
      spender: dex,
      amount: requiredForApproval,
      hash: undefined,
    };

    writeApprove({
      abi: ABIS.TIP20Token,
      address: tokenInAddress,
      functionName: 'approve',
      // Approve exactly what's needed for this swap (finite, not unlimited).
      args: [dex, requiredForApproval],
    });
  };

  useEffect(() => {
    // Capture the hash after the wallet confirms, so we can associate receipt success with current approval intent.
    if (!approveHash) return;
    const ctx = approveContextRef.current;
    if (!ctx) return;
    if (ctx.hash) return;
    approveContextRef.current = { ...ctx, hash: approveHash };
  }, [approveHash]);

  const swap = async () => {
    if (!dex) return;
    if (!tokenInAddress || !tokenOutAddress) return;
    if (mode === 'exactIn') {
      if (!amountInParsed || !minOut) return;
      writeSwap({
        abi: ABIS.StablecoinDEX,
        address: dex,
        functionName: 'swapExactAmountIn',
        args: [tokenInAddress, tokenOutAddress, amountInParsed, minOut],
      });
      return;
    }

    if (!amountOutParsed || !maxIn) return;
    writeSwap({
      abi: ABIS.StablecoinDEX,
      address: dex,
      functionName: 'swapExactAmountOut',
      args: [tokenInAddress, tokenOutAddress, amountOutParsed, maxIn],
    });
  };

  const expectedOutText = useMemo(() => {
    if (mode !== 'exactIn') return '—';
    if (typeof quotedOut !== 'bigint') return '—';
    const d = typeof decimalsOut === 'number' ? decimalsOut : 6;
    return formatUnits(quotedOut, d);
  }, [mode, quotedOut, decimalsOut]);

  const minOutText = useMemo(() => {
    if (mode !== 'exactIn') return '—';
    if (typeof minOut !== 'bigint') return '—';
    const d = typeof decimalsOut === 'number' ? decimalsOut : 6;
    return formatUnits(minOut, d);
  }, [mode, minOut, decimalsOut]);

  const requiredInText = useMemo(() => {
    if (mode !== 'exactOut') return '—';
    if (typeof quotedIn !== 'bigint') return '—';
    const d = typeof decimalsIn === 'number' ? decimalsIn : 6;
    return formatUnits(quotedIn, d);
  }, [mode, quotedIn, decimalsIn]);

  const maxInText = useMemo(() => {
    if (mode !== 'exactOut') return '—';
    if (typeof maxIn !== 'bigint') return '—';
    const d = typeof decimalsIn === 'number' ? decimalsIn : 6;
    return formatUnits(maxIn, d);
  }, [mode, maxIn, decimalsIn]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('page.dex.title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t('page.dex.subtitle')}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-purple-500" />
          <h2 className="text-xl font-bold">{t('page.dex.swapCardTitle')}</h2>
        </div>

        <div className="space-y-4">
          {!isTempo ? (
            <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              {t('page.dex.switchNetworkToSwap', { network: tempoTestnet.name })}
            </div>
          ) : null}

          {dex ? (
            <a
              className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline dark:text-purple-300"
              href={`${tempoTestnet.blockExplorers.default.url}/address/${dex}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('page.dex.viewDex')}
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium">{t('page.dex.from')}</label>
              <select
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
                value={tokenInKey}
                onChange={(e) => {
                  setTokenInKey(e.target.value);
                }}
              >
                {tokenOptions.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
                <option value={CUSTOM_KEY}>{t('page.common.customToken')}</option>
              </select>
              {tokenInKey === CUSTOM_KEY ? (
                <input
                  value={customIn}
                  onChange={(e) => setCustomIn(e.target.value)}
                  placeholder={t('page.common.customTokenAddressPlaceholder')}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
                />
              ) : null}
              {tokenInKey === CUSTOM_KEY && customIn.trim() && !isAddress(customIn.trim()) ? (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400">{t('common.invalidAddress')}</div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium">{t('page.dex.to')}</label>
              <select
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
                value={tokenOutKey}
                onChange={(e) => {
                  setTokenOutKey(e.target.value);
                }}
              >
                {tokenOptions.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
                <option value={CUSTOM_KEY}>{t('page.common.customToken')}</option>
              </select>
              {tokenOutKey === CUSTOM_KEY ? (
                <input
                  value={customOut}
                  onChange={(e) => setCustomOut(e.target.value)}
                  placeholder={t('page.common.customTokenAddressPlaceholder')}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
                />
              ) : null}
              {tokenOutKey === CUSTOM_KEY && customOut.trim() && !isAddress(customOut.trim()) ? (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400">{t('common.invalidAddress')}</div>
              ) : null}
            </div>

            {mode === 'exactIn' ? (
              <div>
                <label className="block text-sm font-medium">{t('page.dex.amountSpend')}</label>
                <input
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  type="number"
                  step="0.000001"
                  placeholder="0.00"
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium">{t('page.dex.amountReceiveAdvanced')}</label>
                <input
                  value={amountOut}
                  onChange={(e) => setAmountOut(e.target.value)}
                  type="number"
                  step="0.000001"
                  placeholder="0.00"
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
                />
              </div>
            )}
          </div>

          <details
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <summary className="cursor-pointer select-none text-sm font-semibold">{t('page.dex.advancedOptions')}</summary>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium">{t('page.dex.swapType')}</label>
                <div className="mt-2 flex gap-2">
                  <Button type="button" onClick={() => setMode('exactIn')} variant={mode === 'exactIn' ? 'default' : 'outline'} size="sm" className="flex-1">
                    {t('page.dex.swapType.spendExact')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setMode('exactOut');
                      setAdvancedOpen(true);
                    }}
                    variant={mode === 'exactOut' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                  >
                    {t('page.dex.swapType.receiveExact')}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  {t('page.dex.swapType.help')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium">{t('page.dex.slippageProtectionBps')}</label>
                <input
                  value={slippageBps}
                  onChange={(e) => setSlippageBps(e.target.value)}
                  inputMode="numeric"
                  placeholder="50"
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
                />
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t('page.dex.slippageExample')}</p>
              </div>
            </div>
          </details>

          <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
            {mode === 'exactIn' ? (
              <>
                <div className="flex items-center justify-between">
                  <span>{t('page.dex.summary.expectedOut')}</span>
                  <span className="font-mono">{expectedOutText}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>{t('page.dex.summary.minOut')}</span>
                  <span className="font-mono">{minOutText}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span>{t('page.dex.summary.requiredIn')}</span>
                  <span className="font-mono">{requiredInText}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>{t('page.dex.summary.maxIn')}</span>
                  <span className="font-mono">{maxInText}</span>
                </div>
              </>
            )}
          </div>

          {approveError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">
              {approveError.message}
            </div>
          ) : null}
          {swapError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">
              {swapError.message}
            </div>
          ) : null}

          {approveHash ? (
            <a
              className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline dark:text-purple-300"
              href={`${tempoTestnet.blockExplorers.default.url}/tx/${approveHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('page.dex.viewApprovalOnExplorer')}
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}

          {swapHash ? (
            <a
              className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:underline dark:text-purple-300"
              href={`${tempoTestnet.blockExplorers.default.url}/tx/${swapHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('page.dex.viewSwapOnExplorer')}
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}

          {needsApproval && !approvalCoversCurrent ? (
            <Button
              type="button"
              onClick={approve}
              disabled={!isConnected || !isTempo || !dex || !tokenInAddress || isApprovePending || approveReceipt.isLoading}
              variant="outline"
              className="w-full"
            >
              {isApprovePending ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.confirmApprovalInWallet')}
                </span>
              ) : approveReceipt.isLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.approvingYour', {
                    symbol: tokenOptions.find((o) => o.key === tokenInKey)?.label ?? 'Token',
                  })}
                </span>
              ) : (
                t('common.approve', { symbol: tokenOptions.find((o) => o.key === tokenInKey)?.label ?? 'Token' })
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={swap}
              disabled={
                !isConnected ||
                !isTempo ||
                !dex ||
                !tokenInAddress ||
                !tokenOutAddress ||
                (mode === 'exactIn' ? !amountInParsed || !minOut : !amountOutParsed || !maxIn) ||
                isSwapPending ||
                swapReceipt.isLoading
              }
              className="w-full"
            >
              {isSwapPending
                ? t('common.confirmInWallet')
                : swapReceipt.isLoading
                  ? t('common.swapping')
                  : swapReceipt.isSuccess
                    ? t('common.swapped')
                    : t('common.swap')}
            </Button>
          )}

          {mode === 'exactIn' && !amountInParsed && amountIn.trim() ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              {t('page.dex.enterValidAmountIn')}
            </div>
          ) : null}

          {mode === 'exactOut' && !amountOutParsed && amountOut.trim() ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              {t('page.dex.enterValidAmountOut')}
            </div>
          ) : null}

          {slippageBpsInt == null && slippageBps.trim() ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              {t('page.dex.enterValidSlippageBps')}
            </div>
          ) : null}

          {dex && !isAddress(dex) ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {t('page.common.invalidDexAddressConfigured')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
