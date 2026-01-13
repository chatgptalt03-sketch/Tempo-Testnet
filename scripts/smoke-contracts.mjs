import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createPublicClient, http, isAddress, keccak256 } from 'viem';

const RPC_URL = process.env.VITE_TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz';

const CHECKS = [
  ['Stablecoin DEX', 'VITE_CONTRACT_DEX', '0xdec0000000000000000000000000000000000000'],
  ['Token Factory', 'VITE_CONTRACT_TOKEN_FACTORY', '0x20fc000000000000000000000000000000000000'],
  ['Fee Manager', 'VITE_CONTRACT_FEE_MANAGER', '0xfeec000000000000000000000000000000000000'],
  ['TIP-403 Registry', 'VITE_CONTRACT_TIP403_REGISTRY', '0x403c000000000000000000000000000000000000'],
  ['pathUSD', undefined, '0x20c0000000000000000000000000000000000000'],
  ['AlphaUSD', undefined, '0x20c0000000000000000000000000000000000001'],
  ['BetaUSD', undefined, '0x20c0000000000000000000000000000000000002'],
  ['ThetaUSD', undefined, '0x20c0000000000000000000000000000000000003'],
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

// Allow a local .env file for terminal smoke runs.
loadDotEnvFileIfExists(path.resolve(process.cwd(), '.env.local'));
loadDotEnvFileIfExists(path.resolve(process.cwd(), '.env'));

const client = createPublicClient({ transport: http(RPC_URL) });

function toAddress(value) {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (!isAddress(trimmed)) return undefined;
  return trimmed;
}

let hadFailure = false;

console.log('Tempo Moderato Testnet predeploy smoke test');
console.log(`RPC: ${RPC_URL}`);
console.log('');

for (const [label, envVar, defaultAddress] of CHECKS) {
  const address =
    (envVar ? toAddress(process.env[envVar]) : undefined) ?? toAddress(defaultAddress) ?? undefined;

  if (!address) {
    hadFailure = true;
    console.log(`${label}: FAIL (missing/invalid address)`);
    continue;
  }

  try {
    const bytecode = await client.getBytecode({ address });
    if (!bytecode) {
      hadFailure = true;
      console.log(`${label}: FAIL (no bytecode) ${address}`);
      continue;
    }

    const size = Math.max(0, (bytecode.length - 2) / 2);
    const codeHash = keccak256(bytecode);

    console.log(`${label}: OK ${address}`);
    console.log(`  size: ${size} bytes`);
    console.log(`  codeHash: ${codeHash}`);
  } catch (err) {
    hadFailure = true;
    const message = err?.message ? String(err.message) : String(err);
    console.log(`${label}: ERROR ${address}`);
    console.log(`  ${message}`);
  }
}

console.log('');
if (hadFailure) {
  console.log('Result: FAIL');
  process.exitCode = 1;
} else {
  console.log('Result: OK');
}
