import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  formatUnits,
  http,
  isAddress,
  maxUint256,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const DEFAULT_RPC_URL = 'https://rpc.moderato.tempo.xyz';
const DEFAULT_FEE_MANAGER = '0xfeec000000000000000000000000000000000000';
const DEFAULT_ALPHA_USD = '0x20c0000000000000000000000000000000000001';
const SYSTEM_VALIDATOR_TOKENS = [
  { symbol: 'PathUSD', address: '0x20c0000000000000000000000000000000000000' },
  { symbol: 'AlphaUSD', address: '0x20c0000000000000000000000000000000000001' },
  { symbol: 'BetaUSD', address: '0x20c0000000000000000000000000000000000002' },
  { symbol: 'ThetaUSD', address: '0x20c0000000000000000000000000000000000003' },
];

function loadDotEnvFileIfExists(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Safety: never allow `.env` to turn on broadcast mode.
      // If you want to send a tx, pass SEND_TX=1 CONFIRM_SEND=1 explicitly at invocation time.
      if (key === 'SEND_TX' || key === 'CONFIRM_SEND') continue;
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

loadDotEnvFileIfExists(path.resolve(process.cwd(), '.env.local'));
loadDotEnvFileIfExists(path.resolve(process.cwd(), '.env'));

function toAddress(value) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (!isAddress(trimmed)) return undefined;
  return trimmed;
}

function findRevertDataHex(err) {
  const candidates = [
    err?.data,
    err?.data?.data,
    err?.cause?.data,
    err?.cause?.data?.data,
    err?.cause?.error?.data,
    err?.cause?.error?.data?.data,
    err?.error?.data,
    err?.error?.data?.data,
    err?.cause?.cause?.data,
    err?.cause?.cause?.data?.data,
  ];

  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    if (!c.startsWith('0x')) continue;
    if (c.length < 10) continue;
    return c;
  }
  return null;
}

const BUILTIN_REVERT_ABI = [
  { type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] },
  { type: 'error', name: 'Panic', inputs: [{ name: 'code', type: 'uint256' }] },
];

function decodeBuiltinRevert(data) {
  try {
    const decoded = decodeErrorResult({ abi: BUILTIN_REVERT_ABI, data });
    if (decoded.errorName === 'Error') {
      const msg = String(decoded.args?.[0] ?? '').trim();
      return msg ? msg : null;
    }
    if (decoded.errorName === 'Panic') {
      const code = decoded.args?.[0];
      const hex = typeof code === 'bigint' ? `0x${code.toString(16)}` : String(code ?? '').trim();
      return hex ? `Panic (${hex})` : 'Panic';
    }
    return decoded.errorName || null;
  } catch {
    return null;
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

function printErrorDetails(prefix, err) {
  const msg = err?.shortMessage || err?.message || String(err);
  console.log(`${prefix}message:  ${msg}`);
  const code = err?.code ?? err?.cause?.code;
  if (code != null) console.log(`${prefix}code:     ${code}`);
  const details = err?.details ?? err?.cause?.details;
  if (details) console.log(`${prefix}details:  ${String(details)}`);

  const meta = err?.metaMessages ?? err?.cause?.metaMessages;
  if (Array.isArray(meta) && meta.length) {
    console.log(`${prefix}meta:`);
    for (const line of meta) console.log(`${prefix}  ${line}`);
  }

  // viem sometimes stores the raw request/response on nested objects; print a safe subset if present.
  const req = err?.request ?? err?.cause?.request;
  if (req) console.log(`${prefix}request:  ${JSON.stringify(req)}`);
  const resp = err?.response ?? err?.cause?.response;
  if (resp) console.log(`${prefix}response: ${JSON.stringify(resp)}`);
}

const TIP20_ABI = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'currency', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'quoteToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const FEE_MANAGER_ABI = [
  {
    type: 'function',
    name: 'getPool',
    stateMutability: 'view',
    inputs: [
      { name: 'userToken', type: 'address' },
      { name: 'validatorToken', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'reserveUserToken', type: 'uint128' },
          { name: 'reserveValidatorToken', type: 'uint128' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'setUserToken',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'userToken', type: 'address' },
      { name: 'validatorToken', type: 'address' },
      { name: 'amountValidatorToken', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: 'liquidity', type: 'uint256' }],
  },
];

const RPC_URL = process.env.VITE_TEMPO_RPC_URL || process.env.RPC_URL || DEFAULT_RPC_URL;
const FEE_MANAGER = toAddress(process.env.VITE_CONTRACT_FEE_MANAGER) || toAddress(process.env.FEE_MANAGER) || DEFAULT_FEE_MANAGER;
const USER_TOKEN = toAddress(process.env.USER_TOKEN);
const VALIDATOR_TOKEN = toAddress(process.env.VALIDATOR_TOKEN) || DEFAULT_ALPHA_USD;

const GAS_LIMIT_OVERRIDE = (() => {
  const raw = String(process.env.GAS_LIMIT || '').trim();
  if (!raw) return null;
  try {
    const n = BigInt(raw);
    if (n <= 0n) return null;
    return n;
  } catch {
    return null;
  }
})();

const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').trim();
const ACCOUNT_ADDRESS = toAddress(process.env.ACCOUNT_ADDRESS) || toAddress(process.env.ACCOUNT);

function normalizePrivateKey(maybeKey) {
  const k = String(maybeKey || '').trim();
  if (!k) return '';
  if (k.startsWith('0x')) return k;
  // Allow raw 64-hex without 0x prefix.
  if (/^[0-9a-fA-F]{64}$/.test(k)) return `0x${k}`;
  return k;
}

function die(msg) {
  console.error(msg);
  process.exitCode = 1;
}

if (!USER_TOKEN) {
  die('Missing USER_TOKEN (address). Set it in .env.local as USER_TOKEN=0x...');
}
if (!isAddress(VALIDATOR_TOKEN)) {
  die('Invalid VALIDATOR_TOKEN.');
}
if (!isAddress(FEE_MANAGER)) {
  die('Invalid FEE_MANAGER.');
}
const NORMALIZED_PRIVATE_KEY = normalizePrivateKey(PRIVATE_KEY);
const hasPrivateKey = Boolean(NORMALIZED_PRIVATE_KEY && NORMALIZED_PRIVATE_KEY.startsWith('0x') && NORMALIZED_PRIVATE_KEY.length === 66);
if (!hasPrivateKey && !ACCOUNT_ADDRESS) {
  die('Provide either PRIVATE_KEY (to send tx) or ACCOUNT_ADDRESS (simulate-only).');
}

if (process.exitCode) process.exit(process.exitCode);

const account = hasPrivateKey
  ? privateKeyToAccount(NORMALIZED_PRIVATE_KEY)
  : { address: ACCOUNT_ADDRESS };
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const walletClient = hasPrivateKey ? createWalletClient({ account, transport: http(RPC_URL) }) : null;

function safeStringify(value) {
  return JSON.stringify(
    value,
    (_k, v) => {
      if (typeof v === 'bigint') return v.toString();
      return v;
    },
    2,
  );
}

async function readToken(address) {
  const [symbol, decimals, currency, quoteToken] = await Promise.all([
    publicClient.readContract({ address, abi: TIP20_ABI, functionName: 'symbol' }),
    publicClient.readContract({ address, abi: TIP20_ABI, functionName: 'decimals' }),
    publicClient.readContract({ address, abi: TIP20_ABI, functionName: 'currency' }).catch(() => null),
    publicClient.readContract({ address, abi: TIP20_ABI, functionName: 'quoteToken' }).catch(() => null),
  ]);

  return {
    address,
    symbol,
    decimals: Number(decimals),
    currency: typeof currency === 'string' ? currency : null,
    quoteToken: typeof quoteToken === 'string' ? quoteToken : null,
  };
}

function fmt(amount, decimals) {
  if (typeof amount !== 'bigint') return '—';
  return formatUnits(amount, decimals);
}

function fmtMaybeBigint(amount, label = '—') {
  return typeof amount === 'bigint' ? amount.toString() : label;
}

function dividePow10(value, exp) {
  if (typeof value !== 'bigint') return null;
  if (exp <= 0) return value;
  return value / 10n ** BigInt(exp);
}

async function tryReadFirst(functionCandidates) {
  for (const c of functionCandidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const value = await publicClient.readContract(c);
      return { ok: true, value, used: c.functionName };
    } catch {
      // try next
    }
  }
  return { ok: false };
}

async function probeFeeManagerState({ feeManagerAddress, signerAddress }) {
  const PROBE_ABI = [
    { type: 'function', name: 'validatorToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'getValidatorToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'userTokens', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'feeTokenOf', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'address' }] },

    // Common guessable variants for validator preference mappings.
    { type: 'function', name: 'validatorTokens', stateMutability: 'view', inputs: [{ name: 'validator', type: 'address' }], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'validatorTokenOf', stateMutability: 'view', inputs: [{ name: 'validator', type: 'address' }], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'getValidatorToken', stateMutability: 'view', inputs: [{ name: 'validator', type: 'address' }], outputs: [{ type: 'address' }] },
  ];

  const validatorTokenRes = await tryReadFirst([
    { address: feeManagerAddress, abi: PROBE_ABI, functionName: 'validatorToken' },
    { address: feeManagerAddress, abi: PROBE_ABI, functionName: 'getValidatorToken' },
  ]);

  const userPrefRes = await tryReadFirst([
    { address: feeManagerAddress, abi: PROBE_ABI, functionName: 'userTokens', args: [signerAddress] },
    { address: feeManagerAddress, abi: PROBE_ABI, functionName: 'feeTokenOf', args: [signerAddress] },
  ]);

  return {
    validatorToken: validatorTokenRes.ok ? validatorTokenRes.value : null,
    validatorTokenSource: validatorTokenRes.ok ? validatorTokenRes.used : null,
    userPrefToken: userPrefRes.ok ? userPrefRes.value : null,
    userPrefTokenSource: userPrefRes.ok ? userPrefRes.used : null,
  };
}

async function probeValidatorPreference({ feeManagerAddress, validatorAddress }) {
  if (!feeManagerAddress || !validatorAddress) {
    return { validatorPrefToken: null, validatorPrefTokenSource: null };
  }

  const PROBE_ABI = [
    { type: 'function', name: 'validatorTokens', stateMutability: 'view', inputs: [{ name: 'validator', type: 'address' }], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'validatorTokenOf', stateMutability: 'view', inputs: [{ name: 'validator', type: 'address' }], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'getValidatorToken', stateMutability: 'view', inputs: [{ name: 'validator', type: 'address' }], outputs: [{ type: 'address' }] },
  ];

  const res = await tryReadFirst([
    { address: feeManagerAddress, abi: PROBE_ABI, functionName: 'validatorTokens', args: [validatorAddress] },
    { address: feeManagerAddress, abi: PROBE_ABI, functionName: 'validatorTokenOf', args: [validatorAddress] },
    { address: feeManagerAddress, abi: PROBE_ABI, functionName: 'getValidatorToken', args: [validatorAddress] },
  ]);

  return {
    validatorPrefToken: res.ok ? res.value : null,
    validatorPrefTokenSource: res.ok ? res.used : null,
  };

  return {
    validatorToken: validatorTokenRes.ok ? validatorTokenRes.value : null,
    validatorTokenSource: validatorTokenRes.ok ? validatorTokenRes.used : null,
    userPrefToken: userPrefRes.ok ? userPrefRes.value : null,
    userPrefTokenSource: userPrefRes.ok ? userPrefRes.used : null,
  };
}

function printFeeBudgetSanity({
  gasLimit,
  baseFeePerGas,
  maxPriorityFeePerGas,
  maxFeePerGasOverride,
  reserveValidatorTokenAtomic,
  validatorTokenDecimals,
  validatorTokenSymbol,
}) {
  if (typeof gasLimit !== 'bigint') return;
  if (typeof baseFeePerGas !== 'bigint') return;
  if (typeof maxPriorityFeePerGas !== 'bigint') return;
  if (typeof reserveValidatorTokenAtomic !== 'bigint') return;
  if (typeof validatorTokenDecimals !== 'number') return;

  // Tempo fee units (from docs):
  // - base_fee_per_gas and max_fee_per_gas are in units of (USD * 1e18) / gas.
  // - TIP-20 tokens have 6 decimals (atomic units = USD * 1e6).
  // Therefore, the token-denominated fee amount is:
  //   feeAtomic = ceil((feePerGas * gasUsed) / 1e12)
  // because 1e18 / 1e6 = 1e12.
  const FEE_UNITS_TO_TOKEN_ATOMIC = 10n ** 12n;
  const maxFeePerGas = typeof maxFeePerGasOverride === 'bigint' ? maxFeePerGasOverride : baseFeePerGas + maxPriorityFeePerGas;
  const maxFeeUnits = gasLimit * maxFeePerGas;
  const maxFeeAtomic = (maxFeeUnits + FEE_UNITS_TO_TOKEN_ATOMIC - 1n) / FEE_UNITS_TO_TOKEN_ATOMIC;

  // Fee AMM swap rate (from spec): M = 0.9970, SCALE = 10_000.
  // Liquidity check computes maxAmountOut = (maxAmount * M) / SCALE and compares it to reserveValidatorToken.
  const M = 9_970n;
  const SCALE = 10_000n;
  const requiredReserveValAtomic = (maxFeeAtomic * M) / SCALE;

  console.log('Fee budget sanity (Tempo fee units)');
  console.log(`  gasLimit:              ${gasLimit.toString()}`);
  console.log(`  baseFeePerGas:         ${baseFeePerGas.toString()} (USD*1e18/gas)`);
  console.log(`  priorityFeePerGas:     ${maxPriorityFeePerGas.toString()} (USD*1e18/gas)`);
  console.log(`  maxFeePerGas:          ${maxFeePerGas.toString()} (USD*1e18/gas)`);
  console.log(`  maxFeeUnits:           ${maxFeeUnits.toString()} (USD*1e18)`);
  console.log(`  maxFeeAtomic (ceil/1e12): ${maxFeeAtomic.toString()} (${validatorTokenSymbol} atomic-ish, assuming USD 1:1)`);
  console.log(`  required reserveV (0.997x): ${requiredReserveValAtomic.toString()} (${validatorTokenSymbol} atomic)`);
  console.log(`  reserveV (atomic):     ${reserveValidatorTokenAtomic.toString()} (${validatorTokenSymbol} with ${validatorTokenDecimals} decimals)`);
  console.log(
    `  check: reserveV >= required ? ${reserveValidatorTokenAtomic >= requiredReserveValAtomic ? 'YES' : 'NO'}`,
  );
  console.log('');
}

async function main() {
  console.log('Fee token diagnosis (no tx sent by default)');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`FeeManager: ${FEE_MANAGER}`);
  console.log(`Signer: ${account.address}`);
  console.log(`Mode: ${hasPrivateKey ? 'can-send' : 'simulate-only'}`);
  console.log('');

  const nativeBal = await publicClient.getBalance({ address: account.address });
  console.log('Native balance (eth_getBalance)');
  console.log(`  raw: ${nativeBal.toString()}`);
  console.log('');

  const [chainId, latestBlock] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlock({ blockTag: 'latest' }).catch(() => null),
  ]);
  const baseFeePerGas = latestBlock?.baseFeePerGas ?? null;
  const blockProposer = latestBlock?.miner || latestBlock?.coinbase || null;

  const [gasPrice, feeEst] = await Promise.all([
    publicClient.getGasPrice().catch(() => null),
    publicClient.estimateFeesPerGas?.().catch(() => null),
  ]);
  console.log('Chain fee model');
  console.log(`  chainId: ${chainId}`);
  console.log(`  baseFeePerGas: ${typeof baseFeePerGas === 'bigint' ? baseFeePerGas.toString() : '—'}`);
  console.log(`  gasPrice:      ${typeof gasPrice === 'bigint' ? gasPrice.toString() : '—'}`);
  console.log(`  latest proposer (coinbase): ${blockProposer ?? '—'}`);
  if (feeEst && typeof feeEst === 'object') {
    const mf = feeEst.maxFeePerGas;
    const mp = feeEst.maxPriorityFeePerGas;
    console.log(
      `  estimateFeesPerGas: maxFeePerGas=${typeof mf === 'bigint' ? mf.toString() : '—'} maxPriorityFeePerGas=${typeof mp === 'bigint' ? mp.toString() : '—'}`,
    );
  }
  console.log('');

  const feeManagerState = await probeFeeManagerState({ feeManagerAddress: FEE_MANAGER, signerAddress: account.address });
  const proposerPref = await probeValidatorPreference({ feeManagerAddress: FEE_MANAGER, validatorAddress: blockProposer });
  if (feeManagerState.validatorToken || feeManagerState.userPrefToken) {
    console.log('FeeManager state (best-effort)');
    console.log(
      `  validatorToken: ${feeManagerState.validatorToken ?? '—'}${feeManagerState.validatorTokenSource ? ` (via ${feeManagerState.validatorTokenSource}())` : ''}`,
    );
    console.log(
      `  userPrefToken:  ${feeManagerState.userPrefToken ?? '—'}${feeManagerState.userPrefTokenSource ? ` (via ${feeManagerState.userPrefTokenSource}(${account.address}))` : ''}`,
    );
    if (blockProposer) {
      console.log(
        `  proposerPrefToken: ${proposerPref.validatorPrefToken ?? '—'}${proposerPref.validatorPrefTokenSource ? ` (via ${proposerPref.validatorPrefTokenSource}(${blockProposer}))` : ''}`,
      );
    }
    console.log('');
  }

  // Prefer an on-chain reported validator token (if available); otherwise fall back to env/default.
  // Determine which validator token to check liquidity against.
  // Priority:
  //  1) proposer preference (if we can read it)
  //  2) feeManager global validator token (if exposed)
  //  3) env/default
  const effectiveValidatorToken =
    (proposerPref.validatorPrefToken && isAddress(proposerPref.validatorPrefToken) ? proposerPref.validatorPrefToken : null) ||
    (feeManagerState.validatorToken && isAddress(feeManagerState.validatorToken) ? feeManagerState.validatorToken : null) ||
    VALIDATOR_TOKEN;

  const [userToken, validatorToken] = await Promise.all([readToken(USER_TOKEN), readToken(effectiveValidatorToken)]);

  const [userBal, valBal, pool] = await Promise.all([
    publicClient.readContract({ address: USER_TOKEN, abi: TIP20_ABI, functionName: 'balanceOf', args: [account.address] }),
    publicClient.readContract({ address: effectiveValidatorToken, abi: TIP20_ABI, functionName: 'balanceOf', args: [account.address] }),
    publicClient.readContract({ address: FEE_MANAGER, abi: FEE_MANAGER_ABI, functionName: 'getPool', args: [USER_TOKEN, effectiveValidatorToken] }),
  ]);

  console.log('User token');
  console.log(`  address:   ${userToken.address}`);
  console.log(`  symbol:    ${userToken.symbol}`);
  console.log(`  decimals:  ${userToken.decimals}`);
  console.log(`  currency:  ${userToken.currency ?? '—'}`);
  console.log(`  quoteToken:${userToken.quoteToken ?? '—'}`);
  console.log(`  balance:   ${fmt(userBal, userToken.decimals)}`);
  console.log('');

  console.log('Validator token');
  console.log(`  address:   ${validatorToken.address}`);
  console.log(`  symbol:    ${validatorToken.symbol}`);
  console.log(`  decimals:  ${validatorToken.decimals}`);
  console.log(`  currency:  ${validatorToken.currency ?? '—'}`);
  console.log(`  balance:   ${fmt(valBal, validatorToken.decimals)}`);
  console.log('');

  const reserveUser = pool?.reserveUserToken ?? pool?.[0];
  const reserveVal = pool?.reserveValidatorToken ?? pool?.[1];

  console.log('Fee AMM pool');
  console.log(`  pair:      (${userToken.symbol}, ${validatorToken.symbol})`);
  console.log(`  reserveU:  ${fmt(reserveUser, userToken.decimals)} ${userToken.symbol}`);
  console.log(`  reserveV:  ${fmt(reserveVal, validatorToken.decimals)} ${validatorToken.symbol}`);
  console.log('');

  const shouldSend = String(process.env.SEND_TX || '').trim() === '1' && String(process.env.CONFIRM_SEND || '').trim() === '1';
  const mintValidatorAmountHuman = String(process.env.MINT_VALIDATOR_AMOUNT || '').trim();
  const shouldMint = Boolean(mintValidatorAmountHuman);
  const shouldTestTransfer = String(process.env.TEST_TRANSFER || '').trim() === '1';

  if (shouldMint) {
    console.log('Optional: mint fee liquidity');
    console.log(`  requested: MINT_VALIDATOR_AMOUNT=${mintValidatorAmountHuman} ${validatorToken.symbol}`);

    if (!shouldSend) {
      console.log('  skipped: set SEND_TX=1 CONFIRM_SEND=1 to broadcast approve/mint');
      console.log('');
    } else if (!walletClient) {
      console.log('  skipped: no PRIVATE_KEY provided (cannot send)');
      console.log('');
    } else {
      try {
        const amountAtomic = parseUnits(mintValidatorAmountHuman, validatorToken.decimals);
        if (amountAtomic <= 0n) throw new Error('MINT_VALIDATOR_AMOUNT must be > 0');

        const allowance = await publicClient.readContract({
          address: validatorToken.address,
          abi: TIP20_ABI,
          functionName: 'allowance',
          args: [account.address, FEE_MANAGER],
        });

        const needApprove = typeof allowance === 'bigint' ? allowance < amountAtomic : true;
        if (needApprove) {
          console.log(`  approve: sending approve(${FEE_MANAGER}, maxUint256) on ${validatorToken.symbol}...`);
          const approveHash = await walletClient.writeContract({
            account,
            address: validatorToken.address,
            abi: TIP20_ABI,
            functionName: 'approve',
            args: [FEE_MANAGER, maxUint256],
          });
          console.log(`  approve tx: ${approveHash}`);
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        } else {
          console.log('  approve: skipped (allowance already sufficient)');
        }

        console.log(`  mint: sending FeeManager.mint(${userToken.symbol}, ${validatorToken.symbol}, ${mintValidatorAmountHuman}, to=${account.address})...`);
        const mintHash = await walletClient.writeContract({
          account,
          address: FEE_MANAGER,
          abi: FEE_MANAGER_ABI,
          functionName: 'mint',
          args: [USER_TOKEN, effectiveValidatorToken, amountAtomic, account.address],
        });
        console.log(`  mint tx: ${mintHash}`);

        await publicClient.waitForTransactionReceipt({ hash: mintHash });

        const poolAfter = await publicClient.readContract({
          address: FEE_MANAGER,
          abi: FEE_MANAGER_ABI,
          functionName: 'getPool',
          args: [USER_TOKEN, effectiveValidatorToken],
        });
        const reserveUserAfter = poolAfter?.reserveUserToken ?? poolAfter?.[0];
        const reserveValAfter = poolAfter?.reserveValidatorToken ?? poolAfter?.[1];
        console.log('  pool after mint');
        console.log(`    reserveU: ${fmt(reserveUserAfter, userToken.decimals)} ${userToken.symbol}`);
        console.log(`    reserveV: ${fmt(reserveValAfter, validatorToken.decimals)} ${validatorToken.symbol}`);
        console.log('');
      } catch (e) {
        console.log('  mint: FAILED');
        printErrorDetails('  ', e);
        console.log('');
      }
    }
  }

  // Also show reserves against all known system validator tokens (helps spot a validator-token mismatch).
  console.log('Fee AMM pools vs system validator tokens');
  for (const vt of SYSTEM_VALIDATOR_TOKENS) {
    if (!isAddress(vt.address)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const p = await publicClient.readContract({
        address: FEE_MANAGER,
        abi: FEE_MANAGER_ABI,
        functionName: 'getPool',
        args: [USER_TOKEN, vt.address],
      });
      const rU = p?.reserveUserToken ?? p?.[0];
      const rV = p?.reserveValidatorToken ?? p?.[1];
      console.log(
        `  (${userToken.symbol}, ${vt.symbol}): reserveU=${fmt(rU, userToken.decimals)} ${userToken.symbol}, reserveV=${fmt(rV, 6)} ${vt.symbol}`,
      );
    } catch (e) {
      const message = e?.shortMessage || e?.message || String(e);
      console.log(`  (${userToken.symbol}, ${vt.symbol}): ERROR (${message})`);
    }
  }
  console.log('');

  if (typeof reserveUser === 'bigint' && reserveUser === 0n && typeof reserveVal === 'bigint' && reserveVal > 0n) {
    console.log('Note');
    console.log(
      `  reserveUserToken is 0 while reserveValidatorToken > 0. This is allowed for single-sided initialization on Tempo.`,
    );
    console.log(
      `  However, some RPC nodes may still refuse to charge fees (or quote a swap) until reserveUserToken > 0.`,
    );
    console.log(
      `  If setUserToken send fails with “Insufficient liquidity for fee token”, try adding a small amount of user-token reserve via FeeManager.mint(userToken, validatorToken, amountUser, amountValidator, to).`,
    );
    console.log('');
  }

  console.log('Quick requirements');
  const reqCurrency = userToken.currency === 'USD';
  const reqBalance = typeof userBal === 'bigint' && userBal > 0n;
  const reqLiquidity = typeof reserveVal === 'bigint' && reserveVal > 0n;
  console.log(`  currency == "USD": ${reqCurrency ? 'OK' : 'FAIL'}`);
  console.log(`  user balance > 0:   ${reqBalance ? 'OK' : 'FAIL'}`);
  console.log(`  validator reserve >0:${reqLiquidity ? 'OK' : 'FAIL'}`);
  console.log('');

  console.log('Simulate setUserToken(...)');
  try {
    const sim = await publicClient.simulateContract({
      account,
      address: FEE_MANAGER,
      abi: FEE_MANAGER_ABI,
      functionName: 'setUserToken',
      args: [USER_TOKEN],
    });

    console.log('  simulate: SUCCESS');
    console.log(`  request:  ${safeStringify({ to: sim.request.address, functionName: sim.request.functionName })}`);
    console.log('  note: simulate success does not guarantee send success on Tempo if your wallet/node cannot charge fees with the chosen fee token.');

    // Fee-budget sanity check: compute an approximate max fee budget and compare to the validator reserve.
    // This is best-effort (Tempo nodes may implement their own maxAmount rules), but it helps detect unit mismatches.
    const estimatedGas = await publicClient
      .estimateGas({
        account: account.address,
        to: sim.request.address,
        data: sim.request.data,
        value: 0n,
      })
      .catch(() => null);

    const gasLimit = GAS_LIMIT_OVERRIDE ?? (typeof estimatedGas === 'bigint' ? estimatedGas : 35000n);
    const maxPriorityFeePerGas =
      typeof feeEst?.maxPriorityFeePerGas === 'bigint'
        ? feeEst.maxPriorityFeePerGas
        : 1_500_000_000n; // fallback

    const maxFeePerGasOverride = typeof feeEst?.maxFeePerGas === 'bigint' ? feeEst.maxFeePerGas : null;
    printFeeBudgetSanity({
      gasLimit,
      baseFeePerGas: typeof baseFeePerGas === 'bigint' ? baseFeePerGas : null,
      maxPriorityFeePerGas,
      maxFeePerGasOverride,
      reserveValidatorTokenAtomic: typeof reserveVal === 'bigint' ? reserveVal : null,
      validatorTokenDecimals: validatorToken.decimals,
      validatorTokenSymbol: validatorToken.symbol,
    });

    if (shouldSend) {
      if (!walletClient) {
        console.log('  Cannot send: no PRIVATE_KEY provided (simulate-only mode).');
        return;
      }
      console.log('');
      console.log('Sending tx (SEND_TX=1 CONFIRM_SEND=1)...');
      try {
        const hash = await walletClient.writeContract(sim.request);
        console.log(`  send: SUCCESS`);
        console.log(`  tx hash: ${hash}`);

        // Optional end-to-end validation: send a TIP-20 transfer on USER_TOKEN.
        // Per fee-token preference rules, TIP-20 transfers use the token contract as the fee token.
        if (shouldTestTransfer) {
          console.log('');
          console.log('Test: TIP-20 transfer to self (forces paying fees in user token)');
          const amount = 1n; // 1 atomic unit
          try {
            const transferHash = await walletClient.writeContract({
              account,
              address: USER_TOKEN,
              abi: TIP20_ABI,
              functionName: 'transfer',
              args: [account.address, amount],
            });
            console.log(`  transfer tx: ${transferHash}`);
            await publicClient.waitForTransactionReceipt({ hash: transferHash });
            console.log('  transfer: confirmed');
          } catch (transferErr) {
            console.log('  transfer: FAILED');
            printErrorDetails('  ', transferErr);
          }
        }
      } catch (sendErr) {
        console.log('  send: FAILED');
        printErrorDetails('  ', sendErr);

        const sendMsg = sendErr?.shortMessage || sendErr?.message || String(sendErr);

        // Retry with a legacy tx if the RPC rejects the default tx params.
        const isInvalidParams =
          String(sendMsg).toLowerCase().includes('invalid parameters') ||
          String(sendMsg).toLowerCase().includes('missing or invalid parameters') ||
          sendErr?.code === -32602 ||
          sendErr?.cause?.code === -32602;

        if (!isInvalidParams) throw sendErr;

        const nonce = await publicClient.getTransactionCount({ address: account.address }).catch(() => null);
        const txRequestBase = {
          account,
          to: sim.request.address,
          data: sim.request.data,
          value: 0n,
          chainId,
          ...(typeof nonce === 'number' ? { nonce } : null),
        };

        console.log('  txRequest (safe fields):');
        console.log(
          `  ${safeStringify({
            ...pick(txRequestBase, ['to', 'value', 'chainId', 'nonce']),
            dataBytes: typeof txRequestBase.data === 'string' ? Math.max(0, (txRequestBase.data.length - 2) / 2) : null,
          })}`,
        );

        // Try EIP-1559 style first if base fee exists.
        if (typeof baseFeePerGas === 'bigint') {
          console.log('  retry: attempting EIP-1559 tx (maxFeePerGas/maxPriorityFeePerGas)...');
          try {
            const gas = await publicClient.estimateGas(txRequestBase);
            const maxPriorityFeePerGas = 1n;
            const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas;
            const hash1559 = await walletClient.sendTransaction({
              ...txRequestBase,
              gas,
              maxFeePerGas,
              maxPriorityFeePerGas,
              type: 'eip1559',
            });
            console.log('  retry (eip1559): SUCCESS');
            console.log(`  tx hash: ${hash1559}`);
            return;
          } catch (retry1559Err) {
            console.log('  retry (eip1559): FAILED');
            printErrorDetails('  ', retry1559Err);
          }
        }

        try {
          const [gas, gasPrice] = await Promise.all([
            publicClient.estimateGas(txRequestBase),
            publicClient.getGasPrice(),
          ]);

          const hash2 = await walletClient.sendTransaction({
            ...txRequestBase,
            gas,
            gasPrice,
            type: 'legacy',
          });

          console.log('  retry: SUCCESS');
          console.log(`  tx hash: ${hash2}`);
        } catch (retryErr) {
          console.log('  retry: FAILED');
          printErrorDetails('  ', retryErr);

          const revertData = findRevertDataHex(retryErr);
          if (revertData) {
            const selector = revertData.slice(0, 10);
            console.log(`  revertData: ${revertData}`);
            console.log(`  selector:   ${selector}`);
            const decoded = decodeBuiltinRevert(revertData);
            if (decoded) console.log(`  decoded:    ${decoded}`);
            console.log(`  lookup:     https://openchain.xyz/signatures?query=${selector}`);
          } else {
            console.log('  (No revert data found in RPC error. Node may be masking revert details.)');
          }

          process.exitCode = 2;
        }
      }
    } else {
      console.log('  (Not sending. To broadcast, run with SEND_TX=1 CONFIRM_SEND=1)');
    }
  } catch (err) {
    console.log('  simulate: FAILED');
    const msg = err?.shortMessage || err?.message || String(err);
    console.log(`  message:  ${msg}`);

    const revertData = findRevertDataHex(err);
    if (revertData) {
      const selector = revertData.slice(0, 10);
      console.log(`  revertData: ${revertData}`);
      console.log(`  selector:   ${selector}`);
      const decoded = decodeBuiltinRevert(revertData);
      if (decoded) console.log(`  decoded:    ${decoded}`);
      console.log(`  lookup:     https://openchain.xyz/signatures?query=${selector}`);
    } else {
      console.log('  (No revert data found in RPC error. Node may be masking revert details.)');
    }

    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
