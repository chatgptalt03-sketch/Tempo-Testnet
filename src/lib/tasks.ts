export type TaskKey =
  | 'claim_faucet_daily'
  | 'make_transfer_daily'
  | 'swap_tokens_daily'
  | 'add_liquidity_daily'
  | 'create_token_once';

export type TaskCadence = 'daily' | 'once';

export type TaskDefinition = {
  key: TaskKey;
  nameKey: string;
  descriptionKey: string;
  cadence: TaskCadence;
  href: string;
  enabled: boolean;
};

export const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  {
    key: 'claim_faucet_daily',
    nameKey: 'tasks.items.claimFaucet.name',
    descriptionKey: 'tasks.items.claimFaucet.desc',
    cadence: 'daily',
    href: '/faucet',
    enabled: true,
  },
  {
    key: 'make_transfer_daily',
    nameKey: 'tasks.items.makeTransfer.name',
    descriptionKey: 'tasks.items.makeTransfer.desc',
    cadence: 'daily',
    href: '/transfer',
    enabled: true,
  },
  {
    key: 'create_token_once',
    nameKey: 'tasks.items.createToken.name',
    descriptionKey: 'tasks.items.createToken.desc',
    cadence: 'once',
    href: '/tokens/create',
    enabled: true,
  },
  {
    key: 'add_liquidity_daily',
    nameKey: 'tasks.items.addLiquidity.name',
    descriptionKey: 'tasks.items.addLiquidity.desc',
    cadence: 'daily',
    href: '/dex/liquidity',
    enabled: true,
  },
  {
    key: 'swap_tokens_daily',
    nameKey: 'tasks.items.swapTokens.name',
    descriptionKey: 'tasks.items.swapTokens.desc',
    cadence: 'daily',
    href: '/dex',
    enabled: true,
  },
] as const;
