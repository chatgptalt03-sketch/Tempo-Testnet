import { isAddress } from 'viem';

export type ContractKey = 'dex' | 'tokenFactory' | 'feeManager' | 'tip403Registry';

export type ContractInfo = {
  key: ContractKey;
  label: string;
  address?: `0x${string}`;
};

const DEFAULTS: Record<ContractKey, `0x${string}`> = {
  dex: '0xdec0000000000000000000000000000000000000',
  tokenFactory: '0x20fc000000000000000000000000000000000000',
  feeManager: '0xfeec000000000000000000000000000000000000',
  tip403Registry: '0x403c000000000000000000000000000000000000',
};

function readAddress(envValue: unknown): `0x${string}` | undefined {
  if (typeof envValue !== 'string' || envValue.trim().length === 0) return undefined;
  const value = envValue.trim();
  if (!isAddress(value)) return undefined;
  return value as `0x${string}`;
}

export const CONTRACTS: ContractInfo[] = [
  { key: 'dex', label: 'Stablecoin DEX', address: readAddress(import.meta.env.VITE_CONTRACT_DEX) ?? DEFAULTS.dex },
  {
    key: 'tokenFactory',
    label: 'Token Factory',
    address: readAddress(import.meta.env.VITE_CONTRACT_TOKEN_FACTORY) ?? DEFAULTS.tokenFactory,
  },
  {
    key: 'feeManager',
    label: 'Fee Manager',
    address: readAddress(import.meta.env.VITE_CONTRACT_FEE_MANAGER) ?? DEFAULTS.feeManager,
  },
  {
    key: 'tip403Registry',
    label: 'TIP-403 Registry',
    address:
      readAddress(import.meta.env.VITE_CONTRACT_TIP403_REGISTRY) ?? DEFAULTS.tip403Registry,
  },
];
