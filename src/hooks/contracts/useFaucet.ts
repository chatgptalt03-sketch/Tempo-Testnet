import { useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { markTaskCompleted } from '@/lib/taskProgressStorage';

type RpcResult = unknown;

export function useFaucet() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: tempoTestnet.id });

  const [isPending, setIsPending] = useState(false);
  const [lastResult, setLastResult] = useState<RpcResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const txHashes = useMemo(() => {
    if (!Array.isArray(lastResult)) return null;
    const hashes = lastResult.filter(
      (v): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v),
    );
    return hashes.length ? hashes : null;
  }, [lastResult]);

  const resultText = useMemo(() => {
    if (lastResult == null) return null;
    if (typeof lastResult === 'string') return lastResult;
    try {
      return JSON.stringify(lastResult);
    } catch {
      return String(lastResult);
    }
  }, [lastResult]);

  const canClaim = Boolean(isConnected && address && publicClient && !isPending);

  const claimTokens = async () => {
    if (!address || !publicClient) return;
    setLastError(null);
    setLastResult(null);
    setIsPending(true);
    try {
      const requester = publicClient as unknown as {
        request: <TResult = unknown>(args: { method: string; params?: readonly unknown[] }) => Promise<TResult>;
      };

      const result = await requester.request({ method: 'tempo_fundAddress', params: [address] });
      markTaskCompleted(tempoTestnet.id, address, 'claim_faucet_daily');
      setLastResult(result ?? 'OK');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
    } finally {
      setIsPending(false);
    }
  };

  return {
    address,
    isConnected,
    publicClient,
    isPending,
    lastResult,
    lastError,
    txHashes,
    resultText,
    canClaim,
    claimTokens,
  };
}
