import { useState } from 'react';
import { Coins } from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { markTaskCompleted } from '@/lib/taskProgressStorage';
import { Button } from '@/components/ui/button';

export default function CreateToken() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('6');
  const [initialSupply, setInitialSupply] = useState('1000000');
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);

  const deploy = async () => {
    setDeploying(true);
    setDeployed(false);
    await new Promise((r) => window.setTimeout(r, 1200));
    setDeploying(false);
    setDeployed(true);

    if (address && chainId === tempoTestnet.id) {
      markTaskCompleted(tempoTestnet.id, address, 'create_token_once');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Create Token</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Deploy a new token contract (demo UI)</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-2">
          <Coins className="h-6 w-6 text-purple-500" />
          <h2 className="text-xl font-bold">Token Details</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Token"
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Symbol</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="MTK"
              maxLength={6}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 uppercase outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">Decimals</label>
              <input
                value={decimals}
                onChange={(e) => setDecimals(e.target.value)}
                type="number"
                min={0}
                max={18}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Initial Supply</label>
              <input
                value={initialSupply}
                onChange={(e) => setInitialSupply(e.target.value)}
                type="number"
                min={0}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-800 dark:bg-gray-900"
              />
            </div>
          </div>

          {deployed ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
              Token deployed (mock). Wire this to a real factory later.
            </div>
          ) : null}

          <Button type="button" onClick={deploy} disabled={deploying || !name || !symbol} className="w-full">
            {deploying ? 'Deploying...' : 'Deploy Token'}
          </Button>

          <p className="text-xs text-gray-600 dark:text-gray-400">
            UI is based on the demo. No on-chain transaction yet.
          </p>
        </div>
      </div>
    </div>
  );
}
