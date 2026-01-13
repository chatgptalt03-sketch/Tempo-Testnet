import { useMemo, useState } from 'react';
import { Check, Copy, Settings } from 'lucide-react';
import { CONTRACTS } from '@/config/contracts';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { Button, buttonClassName } from '@/components/ui/button';

export default function Contracts() {
  const entries = useMemo(
    () => CONTRACTS.filter((c) => c.address).map((c) => [c.label, c.address!] as const),
    [],
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(label);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Contract Addresses</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Defaults come from the official Tempo docs; you can override them via env vars.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Override via <span className="font-mono">VITE_CONTRACT_DEX</span>,{' '}
          <span className="font-mono">VITE_CONTRACT_TOKEN_FACTORY</span>,{' '}
          <span className="font-mono">VITE_CONTRACT_FEE_MANAGER</span>,{' '}
          <span className="font-mono">VITE_CONTRACT_TIP403_REGISTRY</span>.
        </div>

        <div className="space-y-4">
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
              No contract addresses configured yet.
            </div>
          ) : null}

          {entries.map(([name, address]) => (
            <div
              key={name}
              className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{name}</p>
                </div>
                <p className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">{address}</p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <a
                  className={buttonClassName({
                    variant: 'outline',
                    size: 'sm',
                    className: 'hidden sm:inline-flex',
                  })}
                  href={`${tempoTestnet.blockExplorers.default.url}/address/${address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explorer
                </a>

                <Button type="button" onClick={() => copy(name, address)} variant="ghost" size="icon" aria-label={`Copy ${name}`}>
                  {copiedKey === name ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5 text-purple-500" />
          <h2 className="text-xl font-bold">Network Info</h2>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Chain ID</dt>
            <dd className="font-mono">{tempoTestnet.id}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-600 dark:text-gray-400">RPC URL</dt>
            <dd className="font-mono">{tempoTestnet.rpcUrls.default.http[0]}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-600 dark:text-gray-400">Explorer</dt>
            <dd className="font-mono">https://explore.tempo.xyz</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
