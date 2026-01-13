// Scaffold placeholder hook.
export function useTIP20Token() {
  return {
    transfer: async () => undefined,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    hash: undefined as undefined | string,
    error: undefined as undefined | Error,
  };
}
