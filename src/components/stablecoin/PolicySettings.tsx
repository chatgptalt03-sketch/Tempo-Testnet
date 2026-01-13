import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { ShieldCheck } from 'lucide-react';
import { isAddress } from 'viem';
import { tempoTestnet } from '@/lib/chains/tempoTestnet';
import { CONTRACTS } from '@/config/contracts';
import { ABIS } from '@/contracts/abis';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { parseContractError } from '@/utils/errorParser';
import { useI18n } from '@/lib/i18n';

type Address = `0x${string}`;

function parseAddressList(raw: string): Address[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => isAddress(s))
    .map((s) => s as Address);
}

export function PolicySettings() {
  const { t } = useI18n();
  const chainId = useChainId();
  const isTempo = chainId === tempoTestnet.id;
  const { address, isConnected } = useAccount();
  const [searchParams] = useSearchParams();

  const token = (searchParams.get('token') ?? '').trim();
  const tokenAddress = isAddress(token) ? (token as Address) : null;

  const registry = useMemo(() => CONTRACTS.find((c) => c.key === 'tip403Registry')?.address, []);

  const [owner, setOwner] = useState<string>('');
  const effectiveOwner = useMemo(() => {
    const raw = owner.trim();
    if (!raw) return address ?? null;
    return isAddress(raw) ? (raw as Address) : null;
  }, [owner, address]);

  const [whitelist, setWhitelist] = useState<string>('');
  const [blacklist, setBlacklist] = useState<string>('');
  const [policyId, setPolicyId] = useState<string>('');

  const policyIdBigInt = useMemo(() => {
    if (!policyId.trim()) return null;
    try {
      return BigInt(policyId);
    } catch {
      return null;
    }
  }, [policyId]);

  const policyExists = useReadContract({
    address: registry ?? undefined,
    abi: ABIS.TIP403Registry,
    functionName: 'policyExists',
    args: policyIdBigInt && registry ? [policyIdBigInt] : undefined,
    query: { enabled: Boolean(isTempo && registry && policyIdBigInt) },
  });

  const policyData = useReadContract({
    address: registry ?? undefined,
    abi: ABIS.TIP403Registry,
    functionName: 'policyData',
    args: policyIdBigInt && registry ? [policyIdBigInt] : undefined,
    query: { enabled: Boolean(isTempo && registry && policyIdBigInt) },
  });

  const {
    data: createHash,
    writeContract: writeCreate,
    isPending: isCreatePending,
    error: createError,
  } = useWriteContract();
  const createReceipt = useWaitForTransactionReceipt({ hash: createHash });

  const {
    data: modifyHash,
    writeContract: writeModify,
    isPending: isModifyPending,
    error: modifyError,
  } = useWriteContract();
  const modifyReceipt = useWaitForTransactionReceipt({ hash: modifyHash });

  const [modifyType, setModifyType] = useState<'whitelist' | 'blacklist'>('whitelist');
  const [modifyMode, setModifyMode] = useState<'add' | 'remove'>('add');
  const [modifyAddresses, setModifyAddresses] = useState<string>('');

  const [checkFrom, setCheckFrom] = useState<string>('');
  const [checkTo, setCheckTo] = useState<string>('');
  const canCheck = isAddress(checkFrom) && isAddress(checkTo) && Boolean(policyIdBigInt);

  const authCheck = useReadContract({
    address: registry ?? undefined,
    abi: ABIS.TIP403Registry,
    functionName: 'isAuthorized',
    args: canCheck && registry && policyIdBigInt ? [checkFrom as Address, checkTo as Address, policyIdBigInt] : undefined,
    query: { enabled: Boolean(isTempo && registry && canCheck) },
  });

  const createPolicy = async () => {
    if (!registry) return;
    if (!effectiveOwner) return;
    const wl = parseAddressList(whitelist);
    const bl = parseAddressList(blacklist);
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    writeCreate({
      address: registry,
      abi: ABIS.TIP403Registry,
      functionName: 'createPolicy',
      args: [effectiveOwner, wl, bl, timestamp],
    });
  };

  const modify = async () => {
    if (!registry) return;
    if (!policyIdBigInt) return;
    const list = parseAddressList(modifyAddresses);
    if (!list.length) return;
    const add = modifyMode === 'add';

    if (modifyType === 'whitelist') {
      writeModify({
        address: registry,
        abi: ABIS.TIP403Registry,
        functionName: 'modifyPolicyWhitelist',
        args: [policyIdBigInt, list, add],
      });
      return;
    }

    writeModify({
      address: registry,
      abi: ABIS.TIP403Registry,
      functionName: 'modifyPolicyBlacklist',
      args: [policyIdBigInt, list, add],
    });
  };

  const ownerFromRegistry = (policyData.data as { owner?: Address } | undefined)?.owner;
  const timestampFromRegistry = (policyData.data as { timestamp?: bigint } | undefined)?.timestamp;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-blue-500" />
        <h2 className="text-xl font-bold">{t('issuance.policy.title')}</h2>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('issuance.policy.subtitle')}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
          <h3 className="text-lg font-bold">{t('issuance.policy.createTitle')}</h3>
          <label className="mt-3 block text-sm font-medium">{t('issuance.policy.ownerOptional')}</label>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={address ?? '0x...'} className="mt-2 font-mono" />

          <label className="mt-3 block text-sm font-medium">{t('issuance.policy.whitelistLabel')}</label>
          <Input
            value={whitelist}
            onChange={(e) => setWhitelist(e.target.value)}
            placeholder={t('issuance.policy.addressesPlaceholder')}
            className="mt-2 font-mono"
          />

          <label className="mt-3 block text-sm font-medium">{t('issuance.policy.blacklistLabel')}</label>
          <Input
            value={blacklist}
            onChange={(e) => setBlacklist(e.target.value)}
            placeholder={t('issuance.policy.addressesPlaceholder')}
            className="mt-2 font-mono"
          />

          {createError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
              {parseContractError(createError)}
            </div>
          ) : null}

          <Button
            type="button"
            className="mt-4"
            onClick={createPolicy}
            disabled={!isConnected || !isTempo || !registry || !effectiveOwner || isCreatePending}
          >
            {isCreatePending ? t('common.submitting') : t('issuance.policy.createButton')}
          </Button>
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            {t('common.status')}{' '}
            {createReceipt.isLoading ? t('common.confirming') : createReceipt.isSuccess ? t('common.confirmed') : '—'}
          </div>

          <div className="mt-4 text-xs text-gray-600 dark:text-gray-400">
            {t('issuance.policy.note')}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
          <h3 className="text-lg font-bold">{t('issuance.policy.viewModifyTitle')}</h3>
          <label className="mt-3 block text-sm font-medium">{t('issuance.policy.policyId')}</label>
          <Input value={policyId} onChange={(e) => setPolicyId(e.target.value)} placeholder="1" className="mt-2 font-mono" />
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            {t('issuance.policy.exists')}{' '}
            {typeof policyExists.data === 'boolean' ? (policyExists.data ? t('common.yes') : t('common.no')) : '—'}
          </div>
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            {t('issuance.policy.owner')}{' '}
            <span className="font-mono">{ownerFromRegistry ?? '—'}</span>
          </div>
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            {t('issuance.policy.timestamp')}{' '}
            {typeof timestampFromRegistry === 'bigint' ? timestampFromRegistry.toString() : '—'}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">{t('issuance.policy.list')}</label>
              <Select className="mt-2" value={modifyType} onChange={(e) => setModifyType(e.target.value as 'whitelist' | 'blacklist')}>
                <option value="whitelist">{t('issuance.policy.whitelist')}</option>
                <option value="blacklist">{t('issuance.policy.blacklist')}</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium">{t('issuance.policy.mode')}</label>
              <Select className="mt-2" value={modifyMode} onChange={(e) => setModifyMode(e.target.value as 'add' | 'remove')}>
                <option value="add">{t('issuance.policy.add')}</option>
                <option value="remove">{t('issuance.policy.remove')}</option>
              </Select>
            </div>
          </div>

          <label className="mt-3 block text-sm font-medium">{t('issuance.policy.addressesCommaSeparated')}</label>
          <Input
            value={modifyAddresses}
            onChange={(e) => setModifyAddresses(e.target.value)}
            placeholder={t('issuance.policy.addressesPlaceholder')}
            className="mt-2 font-mono"
          />

          {modifyError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
              {parseContractError(modifyError)}
            </div>
          ) : null}

          <Button
            type="button"
            className="mt-4"
            variant="outline"
            onClick={modify}
            disabled={!isConnected || !isTempo || !registry || !policyIdBigInt || isModifyPending}
          >
            {isModifyPending ? t('common.submitting') : t('issuance.policy.applyChange')}
          </Button>
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            {t('common.status')}{' '}
            {modifyReceipt.isLoading ? t('common.confirming') : modifyReceipt.isSuccess ? t('common.confirmed') : '—'}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <h3 className="text-lg font-bold">{t('issuance.policy.authCheckTitle')}</h3>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          {t('issuance.policy.authCheckHelp')}
          {tokenAddress ? ` (${t('issuance.policy.currentToken')}: ${tokenAddress})` : ''}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">{t('issuance.policy.from')}</label>
            <Input value={checkFrom} onChange={(e) => setCheckFrom(e.target.value)} placeholder={address ?? '0x...'} className="mt-2 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium">{t('issuance.policy.to')}</label>
            <Input value={checkTo} onChange={(e) => setCheckTo(e.target.value)} placeholder="0x..." className="mt-2 font-mono" />
          </div>
        </div>
        <div className="mt-3 text-sm">
          {t('issuance.policy.authorized')}{' '}
          <span className="font-mono">
            {typeof authCheck.data === 'boolean' ? (authCheck.data ? 'true' : 'false') : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
