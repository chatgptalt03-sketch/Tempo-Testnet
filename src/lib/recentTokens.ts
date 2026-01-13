type RecentTokensState = {
  tokens: string[];
};

const STORAGE_PREFIX = 'tempo:testnet:recentTokens';
const RECENT_TOKENS_EVENT = 'tempo:recentTokensUpdated';

function storageKey(chainId: number, address: string): string {
  return `${STORAGE_PREFIX}:${chainId}:${address.toLowerCase()}`;
}

export function loadRecentTokens(chainId: number, address: string): RecentTokensState {
  try {
    const raw = window.localStorage.getItem(storageKey(chainId, address));
    if (!raw) return { tokens: [] };
    const parsed = JSON.parse(raw) as RecentTokensState;
    return { tokens: Array.isArray(parsed?.tokens) ? parsed.tokens : [] };
  } catch {
    return { tokens: [] };
  }
}

export function saveRecentTokens(chainId: number, address: string, state: RecentTokensState): void {
  window.localStorage.setItem(storageKey(chainId, address), JSON.stringify(state));
}

export function addRecentToken(chainId: number, address: string, tokenAddress: string): void {
  const token = tokenAddress.trim();
  if (!token) return;

  const state = loadRecentTokens(chainId, address);

  const next = [token, ...state.tokens.filter((t) => t.toLowerCase() !== token.toLowerCase())].slice(0, 10);

  saveRecentTokens(chainId, address, { tokens: next });

  window.dispatchEvent(
    new CustomEvent(RECENT_TOKENS_EVENT, {
      detail: { chainId, address: address.toLowerCase(), token: token.toLowerCase() },
    }),
  );
}

export function removeRecentToken(chainId: number, address: string, tokenAddress: string): void {
  const token = tokenAddress.trim();
  if (!token) return;

  const state = loadRecentTokens(chainId, address);
  const next = state.tokens.filter((t) => t.toLowerCase() !== token.toLowerCase());
  saveRecentTokens(chainId, address, { tokens: next });

  window.dispatchEvent(
    new CustomEvent(RECENT_TOKENS_EVENT, {
      detail: { chainId, address: address.toLowerCase(), token: token.toLowerCase() },
    }),
  );
}

export function subscribeRecentTokensUpdates(onUpdate: () => void): () => void {
  const handleCustom = () => onUpdate();
  const handleStorage = (e: StorageEvent) => {
    if (!e.key) return;
    if (!e.key.startsWith(STORAGE_PREFIX)) return;
    onUpdate();
  };

  window.addEventListener(RECENT_TOKENS_EVENT, handleCustom as EventListener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(RECENT_TOKENS_EVENT, handleCustom as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
}
