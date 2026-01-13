import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useReadContracts } from 'wagmi';
import { formatUnits, isAddress, parseAbiItem } from 'viem';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { TESTNET_ADDRESSES } from '@/contracts/addresses/testnet';
import { loadRecentTokens, subscribeRecentTokensUpdates } from '@/lib/recentTokens';
import { CONTRACTS } from '@/config/contracts';
import {
  discoverFactoryCreatedTokenAddresses,
  discoverTip20TokenAddressesForWallet,
} from '@/lib/indexSupply';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

const TEMPO_CHAIN_ID = 42431 as const;

const TOKEN_CREATED_EVENT = parseAbiItem(
  'event TokenCreated(address indexed token, string name, string symbol, string currency, address quoteToken, address admin, bytes32 salt)',
);

const ROLE_ABI = [
  {
    type: 'function',
    name: 'DEFAULT_ADMIN_ROLE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'role', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const stablecoinAddresses = TESTNET_ADDRESSES[TEMPO_CHAIN_ID];

const DEFAULT_TOKENS = [
  { key: 'PathUSD', label: 'pathUSD', address: stablecoinAddresses.PathUSD as `0x${string}` },
  { key: 'AlphaUSD', label: 'AlphaUSD', address: stablecoinAddresses.AlphaUSD as `0x${string}` },
  { key: 'BetaUSD', label: 'BetaUSD', address: stablecoinAddresses.BetaUSD as `0x${string}` },
  { key: 'ThetaUSD', label: 'ThetaUSD', address: stablecoinAddresses.ThetaUSD as `0x${string}` },
] as const;

export type StablecoinBalanceRow = {
  key: string;
  label: string;
  tokenAddress: `0x${string}`;
  symbol?: string;
  value: string;
};

export function useBalances() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: tempoTestnet.id });

  const [recentTokens, setRecentTokens] = useState<string[]>([]);
  const [factoryTokens, setFactoryTokens] = useState<`0x${string}`[]>([]);
  const [indexSupplyTokens, setIndexSupplyTokens] = useState<`0x${string}`[]>([]);

  const enabled = Boolean(address && chainId === tempoTestnet.id);

  useEffect(() => {
    if (!enabled || !address) {
      setIndexSupplyTokens([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      try {
        const tokens = await discoverTip20TokenAddressesForWallet({
          chainId: tempoTestnet.id,
          walletAddress: address,
          limit: 200,
          signal: controller.signal,
        });
        if (!cancelled) setIndexSupplyTokens(tokens);
      } catch {
        if (!cancelled) setIndexSupplyTokens([]);
      }
    };

    run();
    const id = window.setInterval(run, 60_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [address, enabled]);

  const factoryAddress = useMemo(() => {
    const addr = CONTRACTS.find((c) => c.key === 'tokenFactory')?.address;
    return addr;
  }, []);

  const tokenFactoryStartBlock = useMemo(() => {
    const raw = (import.meta.env.VITE_TOKEN_FACTORY_START_BLOCK as unknown as string | undefined) ?? '';
    if (!raw?.trim()) return 0n;
    try {
      return BigInt(raw.trim());
    } catch {
      return 0n;
    }
  }, []);

  const tokenFactoryLookbackBlocks = useMemo(() => {
    const raw = (import.meta.env.VITE_TOKEN_FACTORY_LOOKBACK_BLOCKS as unknown as string | undefined) ?? '';
    if (!raw?.trim()) return 200_000n;
    try {
      const n = BigInt(raw.trim());
      return n > 0n ? n : 200_000n;
    } catch {
      return 200_000n;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !address || !publicClient || !factoryAddress) {
      setFactoryTokens([]);
      return;
    }

    let cancelled = false;

    const controller = new AbortController();

    (async () => {
      try {
        // Preferred: IndexSupply can filter by non-indexed params (admin) and scan full history cheaply.
        try {
          const created = await discoverFactoryCreatedTokenAddresses({
            chainId: tempoTestnet.id,
            factoryAddress,
            adminAddress: address,
            limit: 200,
            signal: controller.signal,
          });
          if (!cancelled && created.length > 0) {
            setFactoryTokens(created);
            return;
          }
        } catch {
          // fall back to RPC log scan below
        }

        // NOTE: TokenCreated does NOT index admin/creator, so we can’t filter server-side.
        // We keep this cheap by scanning only recent blocks, then verifying ownership on-chain.
        const latest = await publicClient.getBlockNumber();
        const lookbackFrom = latest > tokenFactoryLookbackBlocks ? latest - tokenFactoryLookbackBlocks : 0n;
        const fromBlock = lookbackFrom > tokenFactoryStartBlock ? lookbackFrom : tokenFactoryStartBlock;

        const logs = await publicClient.getLogs({
          address: factoryAddress,
          event: TOKEN_CREATED_EVENT,
          fromBlock,
          toBlock: 'latest',
        });

        const tokensFromLogs = logs
          .map((l) => (l.args as { token?: `0x${string}` } | undefined)?.token)
          .filter((t): t is `0x${string}` => Boolean(t));

        const uniqueCandidates = Array.from(new Set(tokensFromLogs.map((t) => t.toLowerCase())))
          .map((t) => t as `0x${string}`)
          .slice(0, 50);

        const owned: `0x${string}`[] = [];
        for (const token of uniqueCandidates) {
          try {
            const adminRole = (await publicClient.readContract({
              address: token,
              abi: ROLE_ABI,
              functionName: 'DEFAULT_ADMIN_ROLE',
              args: [],
            })) as `0x${string}`;

            const hasAdmin = (await publicClient.readContract({
              address: token,
              abi: ROLE_ABI,
              functionName: 'hasRole',
              args: [address, adminRole],
            })) as boolean;

            if (hasAdmin) owned.push(token);
          } catch {
            // ignore tokens that don't match expected TIP-20 roles interface
          }
        }

        if (!cancelled) setFactoryTokens(owned);
      } catch {
        // If the RPC cannot serve historical logs, the user can still manually add tokens.
        if (!cancelled) setFactoryTokens([]);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    address,
    enabled,
    factoryAddress,
    publicClient,
    tokenFactoryLookbackBlocks,
    tokenFactoryStartBlock,
  ]);

  useEffect(() => {
    if (!enabled || !address || !chainId) {
      setRecentTokens([]);
      return;
    }

    const load = () => setRecentTokens(loadRecentTokens(chainId, address).tokens);
    load();
    return subscribeRecentTokensUpdates(load);
  }, [address, chainId, enabled]);

  const tokens = useMemo(() => {
    const seen = new Set<string>();
    const all: Array<{ key: string; label: string; address: `0x${string}`; isCustom?: boolean }> = [];

    for (const t of DEFAULT_TOKENS) {
      const k = t.address.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      all.push({ ...t });
    }

    // Preferred: on-chain-indexed discovery of all TIP-20 assets held by this wallet.
    for (const addr of indexSupplyTokens) {
      const k = addr.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      all.push({ key: addr, label: 'Asset', address: addr, isCustom: true });
    }

    for (const raw of recentTokens) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (!isAddress(trimmed)) continue;
      const addr = trimmed as `0x${string}`;
      const k = addr.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      all.push({ key: addr, label: 'Custom', address: addr, isCustom: true });
    }

    for (const addr of factoryTokens) {
      const k = addr.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      all.push({ key: addr, label: 'Created', address: addr, isCustom: true });
    }

    return all;
  }, [factoryTokens, indexSupplyTokens, recentTokens]);

  const contracts = useMemo(() => {
    if (!enabled || !address) return [];
    return tokens.flatMap((token) => [
      {
        abi: ERC20_ABI,
        address: token.address,
        functionName: 'symbol' as const,
      },
      {
        abi: ERC20_ABI,
        address: token.address,
        functionName: 'decimals' as const,
      },
      {
        abi: ERC20_ABI,
        address: token.address,
        functionName: 'balanceOf' as const,
        args: [address] as const,
      },
    ]);
  }, [address, enabled, tokens]);

  const query = useReadContracts({
    contracts,
    query: {
      enabled,
      refetchInterval: 15_000,
    },
    allowFailure: true,
  });

  const balances = useMemo(() => {
    if (!enabled) return [] as StablecoinBalanceRow[];

    const rows: StablecoinBalanceRow[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const symbolResult = query.data?.[i * 3]?.result;
      const decimalsResult = query.data?.[i * 3 + 1]?.result;
      const balanceResult = query.data?.[i * 3 + 2]?.result;
      const decimals = typeof decimalsResult === 'number' ? decimalsResult : 6;
      const raw = typeof balanceResult === 'bigint' ? balanceResult : 0n;
      const value = formatUnits(raw, decimals);
      const symbol = typeof symbolResult === 'string' ? symbolResult : undefined;
      rows.push({
        key: tokens[i].key,
        label: tokens[i].label,
        tokenAddress: tokens[i].address,
        symbol,
        value,
      });
    }
    return rows;
  }, [enabled, query.data, tokens]);

  return {
    balances,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    isEnabled: enabled,
  } as const;
}
