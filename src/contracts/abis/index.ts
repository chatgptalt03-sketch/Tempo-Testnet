// ABI exports scaffold. Replace {} with real ABI JSON imports.
import TIP20Token from './TIP20Token.json';
import StablecoinDEX from './StablecoinDEX.json';
import Faucet from './Faucet.json';
import TokenFactory from './TokenFactory.json';
import FeeManager from './FeeManager.json';
import TIP403Registry from './TIP403Registry.json';

export const ABIS = {
  TIP20Token,
  StablecoinDEX,
  Faucet,
  TokenFactory,
  FeeManager,
  TIP403Registry,
} as const;
