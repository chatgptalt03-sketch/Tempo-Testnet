import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ExternalLink, Loader2 } from 'lucide-react';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { CONTRACTS } from '@/config/contracts';
import { TESTNET_ADDRESSES } from '@/contracts/addresses/testnet';
import { ABIS } from '@/contracts/abis';
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

function addThousandsSeparators(integerPart: string) {
  // 1234567 -> 1,234,567
  return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function incrementDecimalString(integerPart: string) {
  let carry = 1;
  const chars = integerPart.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const d = chars[i]?.charCodeAt(0) ?? 48;
    if (d < 48 || d > 57) continue;
    const next = d - 48 + carry;
    if (next >= 10) {
      chars[i] = '0';
      carry = 1;
    } else {
      chars[i] = String(next);
      carry = 0;
      break;
    }
  }
  if (carry === 1) chars.unshift('1');
  return chars.join('');
}

function formatDecimalString(value: string, fractionDigits = 2) {
  // value is a base-10 decimal string like "1234.56789" (no grouping)
  // Output: "1,234.57" (commas + rounded to `fractionDigits`)
  const trimmed = value.trim();
  if (!trimmed) return '0.00';

  const [rawIntegerPart, rawFractionPart] = trimmed.split('.');
  let integerPart = rawIntegerPart?.replace(/^0+(?=\d)/, '') ?? '0';
  let fractionPart = rawFractionPart ?? '';

  if (fractionDigits <= 0) {
    return addThousandsSeparators(integerPart);
  }

  // Pad right so we can safely slice.
  if (fractionPart.length < fractionDigits + 1) {
    fractionPart = fractionPart.padEnd(fractionDigits + 1, '0');
  }

  const keep = fractionPart.slice(0, fractionDigits);
  const roundDigit = fractionPart.charCodeAt(fractionDigits) ? fractionPart[fractionDigits] : '0';

  let keepNumber = Number(keep || '0');
  const shouldRoundUp = roundDigit >= '5';
  if (shouldRoundUp) keepNumber += 1;

  let roundedFraction = String(keepNumber).padStart(fractionDigits, '0');
  if (roundedFraction.length > fractionDigits) {
    // Carry into integer part (e.g., 9.999 -> 10.00 when showing 2 decimals)
    roundedFraction = '0'.repeat(fractionDigits);
    integerPart = incrementDecimalString(integerPart);
  }

  return `${addThousandsSeparators(integerPart)}.${roundedFraction}`;
}

export default function DEX() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const dex = useMemo(() => CONTRACTS.find((c) => c.key === 'dex')?.address, []);

  const { t } = useI18n();

  const isTempo = chainId === tempoTestnet.id;

  const tokenOptions = useMemo((): TokenOption[] => {
    const chain = (TESTNET_ADDRESSES as unknown as Record<number, Record<string, string>>)[tempoTestnet.id];
    const base: TokenOption[] = [
      { key: 'PathUSD', label: 'pathUSD', address: chain.PathUSD as `0x${string}` },
      { key: 'AlphaUSD', label: 'AlphaUSD', address: chain.AlphaUSD as `0x${string}` },
      { key: 'BetaUSD', label: 'BetaUSD', address: chain.BetaUSD as `0x${string}` },
      { key: 'ThetaUSD', label: 'ThetaUSD', address: chain.ThetaUSD as `0x${string}` },
    ];

    return base;
  }, []);

  const [tokenInKey, setTokenInKey] = useState<string>(() => tokenOptions[0]?.key ?? 'PathUSD');
  const [tokenOutKey, setTokenOutKey] = useState<string>(() => tokenOptions[1]?.key ?? 'AlphaUSD');

  const tokenInAddress = useMemo(() => {
    return tokenOptions.find((opt) => opt.key === tokenInKey)?.address ?? null;
  }, [tokenInKey, tokenOptions]);

  const tokenOutAddress = useMemo(() => {
    return tokenOptions.find((opt) => opt.key === tokenOutKey)?.address ?? null;
  }, [tokenOutKey, tokenOptions]);
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

  const {
    data: balanceIn,
    isLoading: isBalanceInLoading,
    isError: isBalanceInError,
  } = useReadContract({
    abi: ABIS.TIP20Token,
    address: tokenInAddress ?? undefined,
    functionName: 'balanceOf',
    args: isConnected && address && tokenInAddress ? [address] : undefined,
    query: { enabled: Boolean(isTempo && isConnected && address && tokenInAddress) },
  });

  const {
    data: balanceOut,
    isLoading: isBalanceOutLoading,
    isError: isBalanceOutError,
  } = useReadContract({
    abi: ABIS.TIP20Token,
    address: tokenOutAddress ?? undefined,
    functionName: 'balanceOf',
    args: isConnected && address && tokenOutAddress ? [address] : undefined,
    query: { enabled: Boolean(isTempo && isConnected && address && tokenOutAddress) },
  });

  const balanceInText = useMemo(() => {
    if (!isConnected || !address) return t('page.common.connectToViewBalances');
    if (!isTempo) return '—';
    if (isBalanceInLoading) return t('page.common.loadingBalances');
    if (isBalanceInError) return '—';
    if (typeof balanceIn !== 'bigint') return '—';
    const d = typeof decimalsIn === 'number' ? decimalsIn : 6;
    return formatDecimalString(formatUnits(balanceIn, d), 2);
  }, [address, balanceIn, decimalsIn, isBalanceInError, isBalanceInLoading, isConnected, isTempo, t]);

  const balanceOutText = useMemo(() => {
    if (!isConnected || !address) return t('page.common.connectToViewBalances');
    if (!isTempo) return '—';
    if (isBalanceOutLoading) return t('page.common.loadingBalances');
    if (isBalanceOutError) return '—';
    if (typeof balanceOut !== 'bigint') return '—';
    const d = typeof decimalsOut === 'number' ? decimalsOut : 6;
    return formatDecimalString(formatUnits(balanceOut, d), 2);
  }, [address, balanceOut, decimalsOut, isBalanceOutError, isBalanceOutLoading, isConnected, isTempo, t]);

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

  const {
    data: quotedOut,
    isLoading: isQuoteOutLoading,
    isError: isQuoteOutError,
    error: quoteOutError,
  } = useReadContract({
    abi: ABIS.StablecoinDEX,
    address: dex,
    functionName: 'quoteSwapExactAmountIn',
    args: canQuoteExactIn ? [tokenInAddress!, tokenOutAddress!, amountInParsed!] : undefined,
    query: { enabled: canQuoteExactIn },
  });

  const {
    data: quotedIn,
    isLoading: isQuoteInLoading,
    isError: isQuoteInError,
    error: quoteInError,
  } = useReadContract({
    abi: ABIS.StablecoinDEX,
    address: dex,
    functionName: 'quoteSwapExactAmountOut',
    args: canQuoteExactOut ? [tokenInAddress!, tokenOutAddress!, amountOutParsed!] : undefined,
    query: { enabled: canQuoteExactOut },
  });

  const quoteUnavailable = useMemo(() => {
    if (mode === 'exactIn') {
      if (!canQuoteExactIn) return false;
      if (isQuoteOutLoading) return false;
      return typeof quotedOut !== 'bigint';
    }
    if (!canQuoteExactOut) return false;
    if (isQuoteInLoading) return false;
    return typeof quotedIn !== 'bigint';
  }, [
    canQuoteExactIn,
    canQuoteExactOut,
    isQuoteInLoading,
    isQuoteOutLoading,
    mode,
    quotedIn,
    quotedOut,
  ]);

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
              </select>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {t('page.dex.balanceLabel')}: <span className="font-mono">{balanceInText}</span>
              </div>
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
              </select>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {t('page.dex.balanceLabel')}: <span className="font-mono">{balanceOutText}</span>
              </div>
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

          {quoteUnavailable ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="font-semibold">{t('page.dex.quoteUnavailable')}</div>
              <div className="mt-1 text-xs">{t('page.dex.quoteUnavailableHint')}</div>
              {mode === 'exactIn' && (isQuoteOutError || quoteOutError) ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold">{t('common.details')}</summary>
                  <div className="mt-1 whitespace-pre-wrap text-xs opacity-90">{(quoteOutError as Error)?.message}</div>
                </details>
              ) : null}
              {mode === 'exactOut' && (isQuoteInError || quoteInError) ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold">{t('common.details')}</summary>
                  <div className="mt-1 whitespace-pre-wrap text-xs opacity-90">{(quoteInError as Error)?.message}</div>
                </details>
              ) : null}
            </div>
          ) : null}

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
              disabled={!isConnected || !isTempo || !dex || !tokenInAddress || quoteUnavailable || isApprovePending || approveReceipt.isLoading}
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
