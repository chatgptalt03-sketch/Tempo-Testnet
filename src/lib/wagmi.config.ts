import { http, createConfig } from 'wagmi';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';
import { tempoTestnet } from './chains/tempoTestnet';

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const connectors = [
	injected({ shimDisconnect: true }),
	coinbaseWallet({ appName: 'Tempo Testnet App' }),
	...(walletConnectProjectId
		? [
				walletConnect({
					projectId: walletConnectProjectId,
					showQrModal: true,
				}),
			]
		: []),
];

export const wagmiConfig = createConfig({
	chains: [tempoTestnet],
	connectors,
	transports: {
		[tempoTestnet.id]: http(tempoTestnet.rpcUrls.default.http[0]),
	},
	ssr: false,
});
