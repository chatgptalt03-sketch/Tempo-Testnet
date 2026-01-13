export function useTransactionStatus() {
  return { status: 'idle' } as const;
}
