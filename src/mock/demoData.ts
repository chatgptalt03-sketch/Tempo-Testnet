export type DemoToken = {
  name: string;
  symbol: string;
  balance: string;
  usd: string;
  address: string;
};

export type DemoTask = {
  id: number;
  name: string;
  description: string;
  completed: boolean;
};

export const MOCK_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

export const MOCK_TOKENS: DemoToken[] = [
  {
    name: 'AlphaUSD',
    symbol: 'AUSD',
    balance: '1,000,000',
    usd: '1,000,000',
    address: '0x1234...5678',
  },
  {
    name: 'BetaUSD',
    symbol: 'BUSD',
    balance: '500,000',
    usd: '500,000',
    address: '0x2345...6789',
  },
  {
    name: 'ThetaUSD',
    symbol: 'TUSD',
    balance: '750,000',
    usd: '750,000',
    address: '0x3456...7890',
  },
  {
    name: 'PathUSD',
    symbol: 'PUSD',
    balance: '250,000',
    usd: '250,000',
    address: '0x4567...8901',
  },
];

export const TASKS: DemoTask[] = [
  { id: 1, name: 'Claim Faucet Tokens', description: 'Get free testnet tokens', completed: true },
  { id: 2, name: 'Make a Transfer', description: 'Send tokens to another address', completed: true },
  { id: 3, name: 'Create Token', description: 'Issue your own token (one-time)', completed: false },
  { id: 4, name: 'Add Liquidity', description: 'Provide liquidity to DEX', completed: false },
  { id: 5, name: 'Swap Tokens', description: 'Exchange stablecoins', completed: false },
];

export const CONTRACT_ADDRESSES = {
  Faucet: '0xFauc3t1234567890abcdef1234567890abcdef12',
  DEX: '0xDEX1234567890abcdef1234567890abcdefabc1',
  'Token Factory': '0xFact0ry1234567890abcdef1234567890abcde',
  'Fee Manager': '0xFeeMan4g3r1234567890abcdef1234567890ab',
} as const;
