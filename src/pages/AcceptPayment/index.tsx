import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Inbox } from 'lucide-react';
import { formatUnits, isAddress, pad, parseAbiItem, parseUnits, stringToHex, toHex } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract } from 'wagmi';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { TESTNET_ADDRESSES } from '@/contracts/addresses/testnet';
import { ABIS } from '@/contracts/abis';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

type AssetKey = 'PathUSD' | 'AlphaUSD' | 'BetaUSD' | 'ThetaUSD';

const TOKEN_KEYS: AssetKey[] = ['PathUSD', 'AlphaUSD', 'BetaUSD', 'ThetaUSD'];

type TransferRow = {
  txHash: `0x${string}`;
  blockNumber: bigint;
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  memo?: `0x${string}`;
};

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const TRANSFER_WITH_MEMO_EVENT = parseAbiItem(
  'event TransferWithMemo(address indexed from, address indexed to, uint256 value, bytes32 indexed memo)',
);

export default function AcceptPayment() {
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: tempoTestnet.id });

  const isTempo = chainId === tempoTestnet.id;

  const [asset, setAsset] = useState<AssetKey>('PathUSD');
  const [recipient, setRecipient] = useState('');
  const [sender, setSender] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [blocksBack, setBlocksBack] = useState(50_000);
  const [memo, setMemo] = useState('');

  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TransferRow[]>([]);

  useEffect(() => {
    if (!recipient && address) setRecipient(address);
  }, [address, recipient]);

  const tokenAddress = useMemo(() => {
    const onTempo = TESTNET_ADDRESSES[tempoTestnet.id as keyof typeof TESTNET_ADDRESSES];
    return onTempo?.[asset];
  }, [asset]);

  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: ABIS.TIP20Token,
    functionName: 'decimals',
    query: {
      enabled: Boolean(isTempo && tokenAddress),
    },
  });

  const recipientOk = useMemo(() => (recipient.length === 0 ? true : isAddress(recipient)), [recipient]);
  const senderOk = useMemo(() => (sender.length === 0 ? true : isAddress(sender)), [sender]);

  const memoParsed = useMemo(() => {
    const raw = memo.trim();
    if (!raw) return { bytes32: undefined as undefined | `0x${string}`, error: null as string | null };

    const looksLikeBytes32 = /^0x[0-9a-fA-F]{64}$/.test(raw);
    if (looksLikeBytes32) return { bytes32: raw as `0x${string}`, error: null as string | null };

    try {
      const bytes32 = pad(stringToHex(raw), { size: 32 });
      return { bytes32, error: null as string | null };
    } catch {
      return {
        bytes32: undefined,
        error: 'Memo must be <= 32 bytes. Use a short ID or a hash/locator.',
      };
    }
  }, [memo]);

  const expectedRaw = useMemo(() => {
    const value = expectedAmount.trim();
    if (!value) return null;
    const decimals = typeof tokenDecimals === 'number' ? tokenDecimals : 6;
    try {
      return parseUnits(value, decimals);
    } catch {
      return null;
    }
  }, [expectedAmount, tokenDecimals]);

  const canSearch =
    Boolean(isConnected && isTempo && publicClient && tokenAddress) &&
    Boolean(recipient && isAddress(recipient)) &&
    Boolean(senderOk) &&
    (!expectedAmount.trim() || expectedRaw != null) &&
    !memoParsed.error &&
    blocksBack > 0;

  const search = async () => {
    if (!publicClient || !tokenAddress) return;
    if (!recipient || !isAddress(recipient)) return;
    if (sender && !isAddress(sender)) return;
    if (memoParsed.error) return;

    setIsSearching(true);
    setError(null);
    setResults([]);

    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > BigInt(blocksBack) ? latest - BigInt(blocksBack) : 0n;

      const memoLogs = await publicClient.getLogs({
        address: tokenAddress,
        event: TRANSFER_WITH_MEMO_EVENT,
        args: {
          to: recipient as `0x${string}`,
          ...(sender ? { from: sender as `0x${string}` } : {}),
          ...(memoParsed.bytes32 ? { memo: memoParsed.bytes32 } : {}),
        },
        fromBlock,
        toBlock: latest,
      });

      const memoRows: TransferRow[] = memoLogs
        .map((l) => {
          const args = l.args as unknown as {
            from?: `0x${string}`;
            to?: `0x${string}`;
            value?: bigint;
            amount?: bigint;
            memo?: `0x${string}`;
          };
          const value = typeof args.value === 'bigint' ? args.value : typeof args.amount === 'bigint' ? args.amount : null;
          if (!l.transactionHash || !l.blockNumber || !args.from || !args.to || value == null || !args.memo) return null;
          return {
            txHash: l.transactionHash,
            blockNumber: l.blockNumber,
            from: args.from,
            to: args.to,
            value,
            memo: args.memo,
          } as TransferRow;
        })
        .filter((v): v is TransferRow => Boolean(v));

      let transferRows: TransferRow[] = [];
      if (!memoParsed.bytes32) {
        const logs = await publicClient.getLogs({
          address: tokenAddress,
          event: TRANSFER_EVENT,
          args: {
            to: recipient as `0x${string}`,
            ...(sender ? { from: sender as `0x${string}` } : {}),
          },
          fromBlock,
          toBlock: latest,
        });

        transferRows = logs
          .map((l) => {
            const args = l.args as unknown as { from?: `0x${string}`; to?: `0x${string}`; value?: bigint };
            if (!l.transactionHash || !l.blockNumber || !args.from || !args.to || typeof args.value !== 'bigint') return null;
            return {
              txHash: l.transactionHash,
              blockNumber: l.blockNumber,
              from: args.from,
              to: args.to,
              value: args.value,
            } as TransferRow;
          })
          .filter((v): v is TransferRow => Boolean(v));
      }

      // Merge and de-duplicate, preferring memo-bearing rows when a transfer emits both events.
      const byKey = new Map<string, TransferRow>();
      for (const row of transferRows) {
        const key = `${row.txHash}-${row.from}-${row.to}-${row.value.toString()}`;
        byKey.set(key, row);
      }
      for (const row of memoRows) {
        const key = `${row.txHash}-${row.from}-${row.to}-${row.value.toString()}`;
        byKey.set(key, row);
      }

      const merged = Array.from(byKey.values());
      const filtered = expectedRaw == null ? merged : merged.filter((r) => r.value === expectedRaw);
      filtered.sort((a, b) => Number(b.blockNumber - a.blockNumber));

      setResults(filtered);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsSearching(false);
    }
  };

  const decimals = typeof tokenDecimals === 'number' ? tokenDecimals : 6;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('page.acceptPayment.title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t('page.acceptPayment.subtitle')}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-2">
          <Inbox className="h-6 w-6 text-[#66D121]" />
          <h2 className="text-xl font-bold">{t('page.acceptPayment.findTitle')}</h2>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-gray-100 p-4 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {t('page.acceptPayment.hint')}
          </div>

          <div>
            <label className="block text-sm font-medium">{t('page.acceptPayment.token')}</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {TOKEN_KEYS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  onClick={() => setAsset(key)}
                  variant={asset === key ? 'default' : 'outline'}
                  size="sm"
                  disabled={!isTempo}
                >
                  {key}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">{t('page.acceptPayment.recipient')}</label>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-[#66D121] dark:border-gray-800 dark:bg-gray-900"
            />
            {!recipientOk ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('common.invalidAddress')}</p> : null}
          </div>

          <div>
            <label className="block text-sm font-medium">{t('page.acceptPayment.sender')}</label>
            <input
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="0x..."
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-[#66D121] dark:border-gray-800 dark:bg-gray-900"
            />
            {!senderOk ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('common.invalidAddress')}</p> : null}
          </div>

          <div>
            <label className="block text-sm font-medium">{t('page.acceptPayment.expectedAmount')}</label>
            <input
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
              type="number"
              step="0.000001"
              placeholder="0.00"
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-[#66D121] dark:border-gray-800 dark:bg-gray-900"
            />
            {expectedAmount.trim() && expectedRaw == null ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('common.enterValidAmount')}</p>
            ) : null}
          </div>

          <details className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            <summary className="cursor-pointer select-none font-semibold">{t('page.acceptPayment.advanced')}</summary>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium">{t('page.acceptPayment.memoLabel')}</label>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t('page.acceptPayment.memoPlaceholder')}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-[#66D121] dark:border-gray-800 dark:bg-gray-900"
                />
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  {t('page.acceptPayment.memoHelpPrefix')} <span className="font-mono">transferWithMemo</span>{' '}
                  {t('page.acceptPayment.memoHelpSuffix')}
                </p>
                {memoParsed.error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{memoParsed.error}</p> : null}
                {memoParsed.bytes32 ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{t('page.acceptPayment.memoBytes32')}</span>
                      <span className="font-mono break-all">{memoParsed.bytes32}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const bytes = new Uint8Array(32);
                        crypto.getRandomValues(bytes);
                        setMemo(toHex(bytes));
                      }}
                    >
                      {t('common.generate')}
                    </Button>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium">{t('page.acceptPayment.searchWindow')}</label>
                <input
                  value={String(blocksBack)}
                  onChange={(e) => setBlocksBack(Number(e.target.value))}
                  type="number"
                  step={1}
                  min={1}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-[#66D121] dark:border-gray-800 dark:bg-gray-900"
                />
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t('page.acceptPayment.searchWindowHelp')}</p>
              </div>
            </div>
          </details>

          {!isTempo ? (
            <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              {t('page.acceptPayment.switchNetworkToSearch', { network: tempoTestnet.name })}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">{error}</div>
          ) : null}

          <Button type="button" onClick={search} disabled={!canSearch || isSearching} className="w-full">
            {isSearching ? t('common.searching') : t('page.acceptPayment.searchTransfers')}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{t('page.acceptPayment.matches')}</h2>
          <div className="text-xs text-gray-600 dark:text-gray-400">{t('page.acceptPayment.tokenDecimals', { decimals })}</div>
        </div>

        {results.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {t('page.acceptPayment.noMatches')}
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((r) => (
              <div
                key={`${r.txHash}-${r.value.toString()}`}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono">
                    {formatUnits(r.value, decimals)} {asset}
                  </div>
                  <a
                    className="inline-flex items-center gap-2 font-semibold text-[#2F6E0C] hover:underline dark:text-[#66D121]"
                    href={`${tempoTestnet.blockExplorers.default.url}/tx/${r.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('page.common.explorer')}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <div className="grid grid-cols-1 gap-1 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-2">
                  <div>
                    {t('page.acceptPayment.from')} <span className="font-mono break-all">{r.from}</span>
                  </div>
                  <div>
                    {t('page.acceptPayment.block')} <span className="font-mono">{r.blockNumber.toString()}</span>
                  </div>
                  {r.memo ? (
                    <div className="sm:col-span-2">
                      {t('page.acceptPayment.memo')} <span className="font-mono break-all">{r.memo}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
