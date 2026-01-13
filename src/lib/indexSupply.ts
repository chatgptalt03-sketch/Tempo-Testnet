type IndexSupplyColumn = { name: string; pgtype: string };

type IndexSupplyResponse = {
  cursor?: string;
  columns: IndexSupplyColumn[];
  rows: unknown[][];
};

function assertHexAddress(address: string): asserts address is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
}

function buildBaseUrl(): string {
  const raw = (import.meta.env.VITE_INDEXSUPPLY_API_BASE as unknown as string | undefined) ?? '';
  return raw.trim() || 'https://api.indexsupply.net/v2';
}

function getApiKey(): string | undefined {
  const raw = (import.meta.env.VITE_INDEXSUPPLY_API_KEY as unknown as string | undefined) ?? '';
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

export async function indexSupplyQuery(params: {
  query: string;
  signatures?: string;
  signal?: AbortSignal;
}): Promise<IndexSupplyResponse> {
  const baseUrl = buildBaseUrl();
  const apiKey = getApiKey();

  const url = new URL(`${baseUrl.replace(/\/$/, '')}/query`);
  if (apiKey) url.searchParams.set('api-key', apiKey);

  url.searchParams.set('query', params.query);
  if (params.signatures) url.searchParams.set('signatures', params.signatures);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: params.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IndexSupply request failed (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json) || json.length < 1) {
    throw new Error('IndexSupply returned an unexpected response shape.');
  }

  const first = json[0] as IndexSupplyResponse;
  if (!first || !Array.isArray(first.columns) || !Array.isArray(first.rows)) {
    throw new Error('IndexSupply returned an unexpected response payload.');
  }

  return first;
}

export async function discoverTip20TokenAddressesForWallet(params: {
  chainId: number;
  walletAddress: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<`0x${string}`[]> {
  const { chainId } = params;
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainId}`);
  }

  const wallet = params.walletAddress.trim();
  assertHexAddress(wallet);

  const limit = Math.max(1, Math.min(params.limit ?? 200, 500));

  // NOTE:
  // - IndexSupply exposes EVM logs via a virtual table derived from the signature.
  // - The virtual event table includes the underlying log `address` column, which is
  //   the TIP-20 token contract address that emitted Transfer.
  // - We aggregate over the full history to get a current-like balance.
  const signatures = 'Transfer(address indexed from, address indexed to, uint256 value)';
  const query = `
    select
      address as token_address,
      sum(case when "to" = '${wallet.toLowerCase()}' then value else -value end) as balance
    from transfer
    where chain = ${chainId}
      and ("from" = '${wallet.toLowerCase()}' or "to" = '${wallet.toLowerCase()}')
    group by address
    having sum(case when "to" = '${wallet.toLowerCase()}' then value else -value end) > 0
    order by sum(case when "to" = '${wallet.toLowerCase()}' then value else -value end) desc
    limit ${limit}
  `.trim();

  const res = await indexSupplyQuery({ query, signatures, signal: params.signal });
  const tokenIdx = res.columns.findIndex((c) => c.name === 'token_address');
  if (tokenIdx < 0) return [];

  const out: `0x${string}`[] = [];
  for (const row of res.rows) {
    const token = row[tokenIdx];
    if (typeof token !== 'string') continue;
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) continue;
    out.push(token as `0x${string}`);
  }

  return Array.from(new Set(out.map((a) => a.toLowerCase()))).map((a) => a as `0x${string}`);
}

export async function discoverFactoryCreatedTokenAddresses(params: {
  chainId: number;
  factoryAddress: string;
  adminAddress: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<`0x${string}`[]> {
  const { chainId } = params;
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainId}`);
  }

  const factory = params.factoryAddress.trim();
  assertHexAddress(factory);

  const admin = params.adminAddress.trim();
  assertHexAddress(admin);

  const limit = Math.max(1, Math.min(params.limit ?? 200, 500));

  // NOTE:
  // We filter by the factory log emitter (`address` column) and the decoded `admin` param.
  // This is the “permanent” way to list tokens you created, without RPC log lookbacks.
  const signatures =
    'TokenCreated(address indexed token, string name, string symbol, string currency, address quoteToken, address admin, bytes32 salt)';
  const query = `
    select token
    from tokencreated
    where chain = ${chainId}
      and address = '${factory.toLowerCase()}'
      and admin = '${admin.toLowerCase()}'
    order by block_num desc
    limit ${limit}
  `.trim();

  const res = await indexSupplyQuery({ query, signatures, signal: params.signal });
  const tokenIdx = res.columns.findIndex((c) => c.name === 'token');
  if (tokenIdx < 0) return [];

  const out: `0x${string}`[] = [];
  for (const row of res.rows) {
    const token = row[tokenIdx];
    if (typeof token !== 'string') continue;
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) continue;
    out.push(token as `0x${string}`);
  }

  return Array.from(new Set(out.map((a) => a.toLowerCase()))).map((a) => a as `0x${string}`);
}
