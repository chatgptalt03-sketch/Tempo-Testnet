import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

import '@rainbow-me/rainbowkit/styles.css';
import { Web3Provider } from '@/lib/web3';
import { I18nProvider } from '@/lib/i18n';

import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Web3Provider>
      <I18nProvider>
        <BrowserRouter
          basename={import.meta.env.BASE_URL}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <App />
        </BrowserRouter>
      </I18nProvider>
    </Web3Provider>
  </StrictMode>,
);
