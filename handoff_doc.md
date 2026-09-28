# Pump Copy Trader — Project Handoff

## Purpose

Local-first Chrome extension for monitoring a Pump.fun/Solana wallet and manually copying its trades with a user-selected amount.

The application does **not** automatically trade. The user sees a tracked-wallet trade, chooses an amount, and approves the resulting transaction through their own wallet.

Initial target wallet:

```text
EDnRycrmkMAwccY2KoGQm9dRug1Kf9sb7V8udd9YjeDQ
```

Initial user wallet is configured through `MY_WALLET_ADDRESS`, but eventual authority should come from the connected browser wallet.

---

## Architecture

```text
Solana / Pump.fun
       ↓
Local Node + TypeScript server
       │
       ├─ Solana RPC
       ├─ tracked-wallet monitoring
       ├─ transaction parsing
       ├─ trade detection
       ├─ Pump.fun metadata
       ├─ SOL/USD price
       ├─ wallet balances
       └─ WebSocket server
              ↓
       localhost WebSocket
              ↓
       Chrome Extension
       ├─ background worker
       ├─ popup
       ├─ trade alerts
       └─ copy controls
              ↓
       Phantom / browser wallet
              ↓
           Solana
```

### Responsibilities

**Server**

* Own Solana RPC interaction.
* Monitor tracked wallet.
* Parse transactions.
* Detect trades.
* Fetch Pump.fun metadata.
* Calculate USD value.
* Monitor user's wallet balances.
* Eventually construct unsigned copy transactions.

**Extension**

* Display normalized events.
* Display wallet state.
* Let user select copy amount.
* Request copy operation.
* Ask wallet to sign transactions.
* Display transaction status.

**Wallet**

* Holds private keys.
* Signs transactions.
* Never expose private keys to the application.

---

# Current Project Structure

```text
pump-copy-trader/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── .env
│
├── server/
│   └── src/
│       ├── index.ts
│       ├── websocket.ts
│       ├── fake-trades.ts
│       ├── wallet.ts
│       ├── solana.ts
│       ├── tracked-wallet.ts
│       ├── token-metadata.ts
│       ├── sol-price.ts
│       └── types.ts
│
└── extension/
    ├── manifest.json
    ├── index.html
    ├── tsconfig.json
    └── src/
        ├── background.ts
        ├── popup.ts
        ├── components/
        │   └── trade-alert.ts
        └── types/
            ├── trade.ts
            ├── copy.ts
            ├── wallet.ts
            └── server.ts
```

---

# Environment

```env
MY_WALLET_ADDRESS=YOUR_SOLANA_PUBLIC_ADDRESS
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TRACKED_WALLET_ADDRESS=EDnRycrmkMAwccY2KoGQm9dRug1Kf9sb7V8udd9YjeDQ
```

Never store private keys or seed phrases.

---

# Core Data Models

## TradeEvent

```ts
export interface TradeEvent {
    id: string;
    wallet: string;
    signature: string;
    side: 'buy' | 'sell';
    mint: string;
    symbol: string;
    tokenAmount: number;
    solAmount: number;
    usdValue: number;
    timestamp: number;
}
```

Real events have been successfully produced with:

* correct BUY/SELL side;
* mint;
* token amount;
* SOL amount;
* Pump.fun symbol;
* USD value;
* tracked wallet;
* transaction signature.

Example:

```ts
{
    side: 'sell',
    mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
    symbol: 'STONK',
    tokenAmount: 10,
    solAmount: 0.021976958,
    usdValue: 2.70355643996858
}
```

## WalletState

```ts
export interface TokenBalance {
    mint: string;
    symbol: string;
    amount: number;
    decimals: number;
}

export interface WalletState {
    address: string;
    solBalance: number;
    tokens: TokenBalance[];
    updatedAt: number;
}
```

## CopyInstruction

```ts
export interface CopyInstruction {
    tradeId: string;
    action: 'buy' | 'sell';
    amountType: 'usd' | 'percentage';
    amount: number;
}
```

BUY means USD amount:

```ts
{
    action: 'buy',
    amountType: 'usd',
    amount: 25
}
```

SELL means percentage of user's current token balance:

```ts
{
    action: 'sell',
    amountType: 'percentage',
    amount: 50
}
```

---

# Current Extension

Manifest V3.

Background service worker:

```json
{
    "background": {
        "service_worker": "dist/background.js",
        "type": "module"
    }
}
```

The extension uses:

* TypeScript.
* Native Web Components.
* Shadow DOM where appropriate.
* No React/Vue.

The popup requests state from the background worker because the popup itself does not remain alive.

Recent trades are currently held in background-worker memory.

---

# Current WebSocket Protocol

Server → extension currently supports:

```ts
{
    type: 'trade',
    data: TradeEvent
}
```

and:

```ts
{
    type: 'wallet-state',
    data: WalletState
}
```

Server:

```text
ws://localhost:8765
```

Reconnect handling has not yet been implemented.

---

# Current Trade Monitoring

`tracked-wallet.ts` polls:

```text
getSignaturesForAddress
```

every 2 seconds.

It requests the latest 20 signatures.

Startup establishes a checkpoint at the latest transaction so historical transactions aren't replayed.

New transactions are processed oldest-first.

Checkpoint is only advanced after successful processing.

Transaction retrieval uses:

```text
getTransaction
encoding: jsonParsed
commitment: confirmed
maxSupportedTransactionVersion: 0
```

---

# Current Trade Detection

Current logic:

1. Reject failed transactions.
2. Identify transactions involving Jupiter.
3. Calculate tracked-wallet token deltas.
4. Ignore WSOL as the traded token.
5. Require exactly one non-WSOL token delta.
6. Positive token delta → BUY.
7. Negative token delta → SELL.
8. Determine SOL amount using WSOL/native SOL transfers.

This is currently a **Jupiter-oriented V1 heuristic**, not universal Solana swap detection.

Future work should add Pump.fun/PumpSwap/direct AMM coverage.

---

# SOL/WSOL Accounting

This has been tested against multiple real transactions.

BUY:

* Looks for outgoing WSOL associated with the tracked wallet.

SELL:

* Looks for incoming WSOL.
* If no suitable WSOL proceeds exist, uses a native SOL fallback.

SELL fallback:

```text
wallet native SOL delta + transaction fee
```

when native SOL delta is positive.

This successfully fixed a previously missed native-SOL SELL.

Temporary WSOL accounts and self-transfers are handled.

The accounting should eventually receive more rigorous testing with a transaction fixture corpus.

---

# Pump.fun Metadata

Current endpoint:

```text
GET https://frontend-api-v3.pump.fun/coins-v2/{mint}
```

Implemented in:

```text
server/src/token-metadata.ts
```

Metadata is cached in memory.

At minimum we use:

```ts
interface PumpFunCoin {
    mint: string;
    name: string;
    symbol: string;
    image_uri?: string | null;
    metadata_uri?: string | null;
    usd_market_cap?: number | null;
}
```

Validated with real tokens:

```text
HSUMi4rMgjrx7zRUabw3ogGu1pa5hmF2eVcXj9Apump → goon

6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx → STONK
```

---

# SOL/USD Pricing

Current endpoint:

```text
GET https://frontend-api-v3.pump.fun/sol-price
```

Implemented in:

```text
server/src/sol-price.ts
```

Price is cached for 60 seconds.

Trade USD value:

```ts
usdValue = solAmount * solPrice;
```

This has been validated against real trades.

Backend keeps full numeric precision.

UI should format values such as:

```text
$2.70355643996858
```

as:

```text
$2.70
```

---

# Current Wallet Monitoring

`wallet.ts` uses:

```text
getBalance
getTokenAccountsByOwner
```

It currently reports:

* SOL balance;
* token balances;
* token mint;
* decimals.

Token symbols in wallet-state are currently mint addresses because RPC token accounts don't provide Pump.fun metadata.

Trade events have proper symbols via Pump.fun metadata.

---

# Current UI

Trade alerts support:

### BUY

```text
$10
$25
Custom
```

### SELL

```text
25%
50%
100%
Custom
```

Custom inputs are validated.

`copy-trade` events are dispatched from the Web Component using:

```ts
bubbles: true,
composed: true
```

The extension currently creates a `CopyInstruction` but does **not** yet send it to the server or execute a transaction.

---

# What Is Already Working

* Local Node/TypeScript server.
* Chrome extension.
* Manifest V3 module service worker.
* Local WebSocket.
* Fake trade events.
* Real tracked-wallet monitoring.
* Solana transaction retrieval.
* Transaction inspection/debugging.
* Token delta detection.
* BUY detection.
* SELL detection.
* WSOL handling.
* Native SOL SELL fallback.
* Pump.fun token metadata.
* Token symbols.
* SOL/USD price lookup.
* USD trade values.
* User wallet SOL/token balance retrieval.
* Extension trade alerts.
* BUY/SELL copy controls.
* `CopyInstruction` creation.

Real tracked-wallet transactions have successfully generated normalized `TradeEvent`s.

---

# Known Limitations

## 1. Copy instructions aren't transported yet

Currently:

```text
Extension
    ↓
CopyInstruction
```

Need:

```text
Extension
    ↓
WebSocket
    ↓
Server
```

## 2. No transaction construction

No real copy transaction is currently constructed.

## 3. No transaction signing/submission

Nothing currently spends the user's funds.

## 4. Phantom connection isn't implemented yet

`MY_WALLET_ADDRESS` is currently configuration-based.

## 5. WebSocket reconnect isn't implemented

Extension should eventually reconnect automatically.

## 6. Extension state is memory-only

Use `chrome.storage.local` later.

## 7. Trade detection is incomplete

Currently primarily Jupiter-based.

## 8. SOL/WSOL accounting needs more fixtures

Current tested cases work, but the parser shouldn't yet be treated as universally correct.

## 9. Fake trades still exist

Useful during development, but should be disabled/removed from MVP runtime.

---

# MVP Roadmap

## Phase 1 — Copy Instruction Transport

**Immediate next step.**

Implement:

```text
Extension
    ↓
copy-trade WebSocket message
    ↓
Server
    ↓
Validate CopyInstruction
    ↓
Log accepted instruction
```

No blockchain transaction execution yet.

Validation:

* trade ID exists;
* action matches original trade;
* BUY amount > 0;
* SELL percentage > 0;
* SELL percentage <= 100.

Checkpoint:

Click:

```text
BUY $10
SELL 50%
```

and verify the server receives the exact expected instruction.

---

## Phase 2 — Persist Extension State

Use:

```text
chrome.storage.local
```

Persist:

* recent trades;
* tracked wallet;
* basic settings.

Never persist private keys.

---

## Phase 3 — WebSocket Reliability

Add:

* reconnect;
* backoff;
* connection status;
* server unavailable state.

---

## Phase 4 — Phantom Connection

Implement:

```text
Extension
    ↓
Detect Phantom
    ↓
Connect
    ↓
Obtain public wallet address
```

The connected wallet should eventually replace the manually configured wallet address as the authoritative user wallet.

---

## Phase 5 — Copy BUY

Flow:

```text
Tracked BUY
    ↓
User selects $10
    ↓
CopyInstruction
    ↓
Server validation
    ↓
Construct unsigned transaction
    ↓
Return transaction
    ↓
Phantom signs
    ↓
Submit to Solana
```

Server constructs but does not sign.

---

## Phase 6 — Copy SELL

Flow:

```text
Tracked SELL
    ↓
User selects 50%
    ↓
Read user's token balance
    ↓
Calculate 50%
    ↓
Construct unsigned transaction
    ↓
Wallet signs
    ↓
Submit
```

The tracked wallet's token amount is NOT used for the user's sell amount.

---

## Phase 7 — Transaction Status

Display:

```text
Preparing...
Waiting for approval...
Submitted...
Confirmed
```

or:

```text
Failed
```

Return transaction signature.

---

## Phase 8 — Balance Refresh

After successful transactions:

* refresh SOL;
* refresh token balance;
* update UI.

---

## Phase 9 — Safety Controls

Before real-money use:

* maximum BUY amount;
* maximum SELL percentage;
* sufficient balance checks;
* valid mint/address checks;
* transaction preview;
* slippage limits;
* priority fee settings;
* compute budget;
* explicit wallet approval.

Never automatically execute a detected trade.

---

## Phase 10 — Parser Test Fixtures

Create fixtures for:

1. Jupiter BUY.
2. Jupiter SELL with WSOL.
3. Native SOL SELL.
4. Temporary WSOL.
5. Token transfer with no SOL movement.
6. SOL-only transaction.
7. Failed transaction.
8. Multi-token transaction.
9. Multiple SOL transfers.
10. Direct Pump.fun/PumpSwap trade.

Assert:

```text
detected/not detected
side
mint
token amount
SOL amount
```

---

## Phase 11 — Broader Swap Support

Investigate:

* Pump.fun direct trades.
* PumpSwap/Pump.fun AMM.
* Other relevant Solana DEX routes.

Don't assume every Solana swap is Jupiter.

---

# MVP Definition

The MVP should let the user:

1. Start local server.
2. Open extension.
3. Connect wallet.
4. Configure tracked wallet.
5. Receive real tracked-wallet trades.
6. See symbol, side, token amount, SOL amount, USD value and timestamp.
7. Select BUY amount.
8. Select SELL percentage.
9. Review transaction.
10. Approve through wallet.
11. Submit to Solana.
12. See success/failure.
13. See updated balance.

Not required:

* cloud infrastructure;
* accounts;
* database;
* automated copy trading;
* analytics;
* portfolio history;
* mobile;
* multiple wallet providers.

---

# Development Style

Work incrementally.

For each step:

1. Make the smallest meaningful change.
2. Compile/run it.
3. Test it.
4. Inspect the result.
5. Only then move to the next step.

Do not jump directly into the full transaction architecture.

When modifying existing files, use the **current code in the project as authoritative** rather than reconstructing older versions from memory.

The immediate next task is:

> **Implement Copy Instruction Transport from the Chrome extension to the local WebSocket server, validate it server-side, and log the accepted instruction. Do not build transactions yet.**
