import type { TradeEvent } from '../types/trade.js';
import type { CopyInstruction } from '../types/copy.js';
import { WalletState } from '../types/wallet.js';

export class TradeAlert extends HTMLElement {
    private trade: TradeEvent | null = null;
    private walletState: WalletState | null = null;

    constructor() {
        super();

        this.attachShadow({ mode: 'open' });
    }

    setTrade(
        trade: TradeEvent,
        walletState: WalletState | null
    ): void {
        this.trade = trade;
        this.walletState = walletState;
        this.render();
    }

    private getTokenBalance(): number {
        if (!this.trade || !this.walletState) {
            return 0;
        }

        const token = this.walletState.tokens.find(
            token => token.mint === this.trade!.mint
        );

        return token?.amount ?? 0;
    }

    private render(): void {
        if (!this.shadowRoot || !this.trade) {
            return;
        }

        const trade = this.trade;
        const isBuy = trade.side === 'buy';

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    margin-bottom: 12px;
                }

                .trade-alert {
                    border: 1px solid #ccc;
                    border-radius: 8px;
                    padding: 12px;
                    font-family: Arial, sans-serif;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .side {
                    font-weight: bold;
                }

                .buy {
                    color: #16803c;
                }

                .sell {
                    color: #b42318;
                }

                .symbol {
                    font-weight: bold;
                    font-size: 18px;
                }

                .details {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                    font-size: 13px;
                    color: #666;
                    margin-bottom: 12px;
                }

                .actions {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
                }

                button {
                    padding: 7px 10px;
                    border: 1px solid #ccc;
                    border-radius: 6px;
                    background: white;
                    cursor: pointer;
                }

                button:hover {
                    background: #f5f5f5;
                }

                .custom-form {
                    display: none;
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px solid #eee;
                }

                .custom-form.visible {
                    display: flex;
                    gap: 6px;
                }

                input {
                    width: 100px;
                    padding: 7px;
                    border: 1px solid #ccc;
                    border-radius: 6px;
                }

                .error {
                    color: #b42318;
                    font-size: 12px;
                    margin-top: 5px;
                }
            </style>

            <div class="trade-alert">
                <div class="header">
                    <span class="side ${isBuy ? 'buy' : 'sell'}">
                        ${trade.side.toUpperCase()}
                    </span>

                    <span class="symbol">
                        ${trade.symbol}
                    </span>

                    <strong>
                        $${trade.usdValue.toFixed(2)}
                    </strong>
                </div>

                <div class="details">
                    <span>SOL: ${trade.solAmount}</span>
                    <span>Tokens: ${trade.tokenAmount.toLocaleString()}</span>
                    <span>
                        Your balance:
                        ${this.getTokenBalance().toLocaleString()} ${trade.symbol}
                    </span>
                    <span>${new Date(trade.timestamp).toLocaleTimeString()}</span>
                    <span>Wallet: ${trade.wallet}</span>
                </div>

                <div class="actions">
                    ${
                        isBuy
                            ? `
                                <button data-action="preset" data-value="10">
                                    Buy $10
                                </button>

                                <button data-action="preset" data-value="25">
                                    Buy $25
                                </button>
                            `
                            : `
                                <button data-action="preset" data-value="25">
                                    Sell 25%
                                </button>

                                <button data-action="preset" data-value="50">
                                    Sell 50%
                                </button>

                                <button data-action="preset" data-value="100">
                                    Sell 100%
                                </button>
                            `
                    }

                    <button data-action="custom">
                        Custom
                    </button>
                </div>

                <div class="custom-form">
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        data-input="custom-amount"
                        placeholder="${isBuy ? 'USD' : '%'}"
                    >

                    <button data-action="submit-custom">
                        ${isBuy ? 'Buy' : 'Sell'}
                    </button>

                    <button data-action="cancel-custom">
                        Cancel
                    </button>

                    <div class="error" data-error></div>
                </div>
            </div>
        `;

        this.attachListeners();
    }

    private attachListeners(): void {
        const root = this.shadowRoot;

        if (!root) {
            return;
        }

        root.querySelectorAll('[data-action="preset"]')
            .forEach((button) => {
                button.addEventListener('click', () => {
                    const value = Number(
                        (button as HTMLElement).dataset.value
                    );

                    this.dispatchCopyInstruction(
                        this.trade?.side === 'buy' ? 'usd' : 'percentage',
                        value
                    );
                });
            });

        root.querySelector('[data-action="custom"]')
            ?.addEventListener('click', () => {
                root.querySelector('.custom-form')
                    ?.classList.add('visible');
            });

        root.querySelector('[data-action="cancel-custom"]')
            ?.addEventListener('click', () => {
                root.querySelector('.custom-form')
                    ?.classList.remove('visible');

                this.clearError();
            });

        root.querySelector('[data-action="submit-custom"]')
            ?.addEventListener('click', () => {
                this.submitCustomAmount();
            });
    }

    private submitCustomAmount(): void {
        if (!this.trade || !this.shadowRoot) {
            return;
        }

        const input = this.shadowRoot.querySelector(
            '[data-input="custom-amount"]'
        ) as HTMLInputElement | null;

        if (!input) {
            return;
        }

        const amount = Number(input.value);

        if (!Number.isFinite(amount) || amount <= 0) {
            this.showError('Enter a valid amount.');
            return;
        }

        if (this.trade.side === 'sell' && amount > 100) {
            this.showError('Sell percentage cannot exceed 100%.');
            return;
        }

        this.dispatchCopyInstruction(
            this.trade.side === 'buy' ? 'usd' : 'percentage',
            amount
        );

        input.value = '';

        this.shadowRoot
            .querySelector('.custom-form')
            ?.classList.remove('visible');

        this.clearError();
    }

    private dispatchCopyInstruction(
        amountType: 'usd' | 'percentage',
        amount: number
    ): void {
        if (!this.trade) {
            return;
        }

        const instruction: CopyInstruction = {
            tradeId: this.trade.id,
            action: this.trade.side,
            amountType,
            amount,
        };

        this.dispatchEvent(
            new CustomEvent<CopyInstruction>('copy-trade', {
                detail: instruction,
                bubbles: true,
                composed: true,
            })
        );
    }

    private showError(message: string): void {
        this.shadowRoot
            ?.querySelector('[data-error]')
            ?.replaceChildren(document.createTextNode(message));
    }

    private clearError(): void {
        const error = this.shadowRoot?.querySelector('[data-error]');

        if (error) {
            error.textContent = '';
        }
    }
}

customElements.define('trade-alert', TradeAlert);