import type { TradeEvent } from './trade.js';
import type { WalletState } from './wallet.js';
import type { CopyInstruction } from './copy.js';

export type ServerMessage =
    | {
          type: 'trade';
          data: TradeEvent;
      }
    | {
          type: 'wallet-state';
          data: WalletState;
      }
    | {
          type: 'copy-trade-accepted';
          data: CopyInstruction;
      };