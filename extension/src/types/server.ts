import type { TradeEvent } from './trade.js';
import type { WalletState } from './wallet.js';

export type ServerMessage =
    | {
          type: 'trade';
          data: TradeEvent;
      }
    | {
          type: 'wallet-state';
          data: WalletState;
      };