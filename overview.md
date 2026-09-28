# Pump Copy Trader — Technical Summary & MVP Plan

# 1. Project Overview

Pump Copy Trader is a local-first Chrome extension and local TypeScript/Node.js service for monitoring a Pump.fun/Solana wallet and allowing the user to manually copy detected trades.

The initial MVP is intentionally local:

- No cloud backend.
- No application-managed private keys.
- The tracked wallet is public and read-only.
- The user's wallet remains controlled by a browser wallet such as Phantom.
- The local server owns Solana RPC access, Pump.fun API access, transaction parsing, and eventually transaction construction.
- The Chrome extension provides the UI, receives normalized trade events, lets the user choose a copy amount, and asks the wallet to sign the resulting transaction.

The current implementation has progressed beyond the initial fake-event prototype and is successfully detecting real trades from a tracked wallet.

---

# 2. Current Architecture

```text
                    Solana / Pump.fun
                           │
                           ▼
                ┌─────────────────────┐
                │ Local Node/TS Server│
                │                     │
                │ - Solana RPC        │
                │ - tracked wallet    │
                │ - tx parsing        │
                │ - trade detection   │
                │ - token metadata    │
                │ - SOL/USD price     │
                │ - WebSocket server  │
                └──────────┬──────────┘
                           │
                    localhost WebSocket
                           │
                           ▼
                ┌─────────────────────┐
                │ Chrome Extension    │
                │                     │
                │ - background worker │
                │ - popup UI           │
                │ - trade alerts       │
                │ - copy controls      │
                └──────────┬──────────┘
                           │
                     Wallet adapter
                           │
                           ▼
                       Phantom
                           │
                           ▼
                         Solana
```

## Responsibility boundaries

### Local server

Responsible for:

Monitoring the tracked wallet.
Querying Solana RPC.
Fetching and parsing transactions.
Detecting probable swaps.
Calculating token and SOL deltas.
Looking up Pump.fun token metadata.
Looking up SOL/USD price.
Normalizing trades into a stable TradeEvent.
Broadcasting events to the extension.
Later validating copy instructions, determining balances, and constructing unsigned transactions.

### Chrome extension

Responsible for:

Maintaining the local server connection.
Receiving normalized trade events.
Displaying recent trades.
Displaying wallet state.
Letting the user choose a copy amount.
Requesting a copy operation.
Presenting transaction approval through the wallet.
Later displaying transaction status.

###  Wallet

Responsible for:

Holding private keys.
Signing transactions.
Sending signed transactions to Solana.

The application must never receive or store the user's private key or seed phrase.

# 3. Current Project Structure
```
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
fake-trades.ts remains useful for development but should eventually be disabled or removed from the MVP runtime path.

# 4. Technology Stack
```
Server:
Node.js
TypeScript
tsx
WebSocket via ws
Native fetch
Solana JSON-RPC
Pump.fun HTTP API

Extension:
Chrome Manifest V3
TypeScript
Native Web Components
Shadow DOM where useful
Background service worker
No React/Vue dependency
Blockchain
Solana mainnet
Solana JSON-RPC
Phantom initially as the user's wallet
```
5. Environment Configuration

Current .env:

MY_WALLET_ADDRESS=YOUR_SOLANA_PUBLIC_ADDRESS
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TRACKED_WALLET_ADDRESS=THE_WALLET_YOU_WANT_TO_FOLLOW

MY_WALLET_ADDRESS is the user's public wallet address.

TRACKED_WALLET_ADDRESS is the wallet being monitored.

These are separate concepts.

No private key should be added to .env.

# 6. Current Data Models

TradeEvent

```
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

Example of a real normalized event:

```
{
    id: '43HJnPwUYNMFTNLyVSyAXb6RhNoZF1miGGa7uk25gnGq2NDMGvKkoPVmYu5jFHng2kcJzgETBXjPdvpTjXYNbiSP',
    wallet: 'EDnRycrmkMAwccY2KoGQm9dRug1Kf9sb7V8udd9YjeDQ',
    signature: '43HJnPwUYNMFTNLyVSyAXb6RhNoZF1miGGa7uk25gnGq2NDMGvKkoPVmYu5jFHng2kcJzgETBXjPdvpTjXYNbiSP',
    side: 'sell',
    mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
    symbol: 'STONK',
    tokenAmount: 10,
    solAmount: 0.021976958,
    usdValue: 2.70355643996858,
    timestamp: 1790539541000
}
```
# 7. CopyInstruction

Current model:

export interface CopyInstruction {
    tradeId: string;
    action: 'buy' | 'sell';
    amountType: 'usd' | 'percentage';
    amount: number;
}

BUY example:

{
    tradeId: '...',
    action: 'buy',
    amountType: 'usd',
    amount: 25
}

SELL example:

{
    tradeId: '...',
    action: 'sell',
    amountType: 'percentage',
    amount: 50
}

BUY amounts represent USD spending. SELL amounts represent a percentage of the user's current position.

# 8. Current Extension UI

The extension currently:

Connects to the local WebSocket.
Receives trade events.
Stores recent trades in the background service worker.
Requests state when the popup opens.
Displays wallet state.
Displays recent trade alerts.
Displays BUY/SELL state.
Provides copy presets.
Provides custom amount controls.
Dispatches copy-trade events from the Web Component.

BUY:

$10
$25
Custom

SELL:

25%
50%
100%
Custom

Custom values are validated to be greater than zero, and sell percentages are limited to 100%.

# 9. Current WebSocket Protocol

The server currently sends:

{
    type: 'trade',
    data: TradeEvent
}

and:

{
    type: 'wallet-state',
    data: WalletState
}

The extension has a corresponding discriminated union.

This protocol should be extended to support copy instructions and transaction lifecycle messages.

# 10. Current Wallet State

The server queries the configured user's wallet using Solana RPC.

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

Currently the server obtains:

SOL balance.
SPL token balances.
Token mint addresses.
Token decimals.

Raw token-account RPC responses do not directly provide symbols, so wallet-state symbols currently fall back to mint addresses.

Trade events use Pump.fun metadata and therefore have proper symbols.

# 11. Solana RPC Layer

server/src/solana.ts provides a generic JSON-RPC helper.

Current RPC methods include:

getBalance
getTokenAccountsByOwner
getSignaturesForAddress
getTransaction

Default endpoint:

https://api.mainnet-beta.solana.com

A dedicated RPC provider should eventually be used for a public/production version.

# 12. Tracked Wallet Monitoring

The tracked wallet monitor:

Calls getSignaturesForAddress.
Requests the latest 20 signatures.
Initializes a checkpoint at the current latest signature.
Finds signatures newer than the checkpoint.
Processes them oldest-first.
Fetches each transaction.
Parses it.
Attempts trade detection.
Creates a normalized TradeEvent.
Broadcasts the event.
Advances the checkpoint after processing.

Polling interval:

2 seconds

Startup intentionally avoids replaying historical transactions.

# 13. Transaction Parsing

The parser examines:

Transaction status.
Wallet native SOL balances.
Pre/post SPL token balances.
Token deltas.
Native SOL transfers.
WSOL transfers.
Inner instructions.
Programs involved.

Token deltas are:

post token amount - pre token amount

for balances owned by the tracked wallet.

# 14. Current Trade Detection

The V1 detector:

Rejects failed transactions.
Checks whether the transaction appears to involve Jupiter.
Calculates tracked-wallet token deltas.
Ignores WSOL as the traded token.
Requires one non-WSOL token delta.
Determines:
positive token delta = BUY
negative token delta = SELL
Determines SOL amount using WSOL/native SOL accounting.

Current swap recognition is primarily Jupiter-based.

This is a V1 heuristic, not a universal Solana swap decoder.

# 15. SOL/WSOL Accounting

Multiple real BUY and SELL transactions have been tested successfully.

Normal cases:

BUYs use outgoing WSOL.
SELLs use incoming WSOL.

The parser handles temporary WSOL accounts and ignores self-transfers when selecting the relevant transfer.

A native SOL fallback was added for SELLs where proceeds appear directly as native SOL.

The fallback uses:

native wallet SOL delta + transaction fee

when the wallet's native SOL delta is positive.

This recovered a previously missed real SELL.

This accounting should still be hardened before production.

# 16. Pump.fun Token Metadata

The server queries:

GET https://frontend-api-v3.pump.fun/coins-v2/{mint}

Current metadata model:

interface PumpFunCoin {
    mint: string;
    name: string;
    symbol: string;
    image_uri?: string | null;
    metadata_uri?: string | null;
    usd_market_cap?: number | null;
}

Metadata is cached in memory by mint.

Real validation confirmed correct symbols, including:

HSUMi4rMgjrx7zRUabw3ogGu1pa5hmF2eVcXj9Apump → goon
6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx → STONK
# 17. SOL/USD Pricing

The server queries:

GET https://frontend-api-v3.pump.fun/sol-price

The result is cached for 60 seconds.

USD value:

usdValue = solAmount * solPrice;

This has been validated against real trades.

The backend retains numeric precision. The extension should format the value for display, e.g. $2.70.

# 18. Current Server Loop

The server currently:

Generates fake trades.
Broadcasts wallet state.
Polls the tracked wallet.

Development intervals:

fake trade: every 5 seconds
wallet state: every 10 seconds
tracked wallet: every 2 seconds

The fake trade path should eventually be removed or disabled for the MVP runtime.

# 19. Completed Work
```Infrastructure
 Node.js/TypeScript project.
 Local server.
 Chrome Manifest V3 extension.
 TypeScript compilation.
 Local WebSocket communication.
 Extension background service worker.
 Popup state retrieval.
Trade monitoring
 Track a configured Solana wallet.
 Poll recent signatures.
 Maintain polling checkpoint.
 Fetch parsed transactions.
 Detect successful swap-like transactions.
 Calculate token deltas.
 Detect BUY vs SELL.
 Calculate SOL amount for tested BUYs.
 Calculate SOL amount for tested SELLs.
 Handle temporary WSOL accounts.
 Native SOL fallback for tested SELLs.
Data enrichment
 Pump.fun token metadata.
 Token symbols in trade events.
 Pump.fun SOL/USD price.
 USD trade value.
Extension UI
 Recent trade display.
 Wallet display.
 BUY controls.
 SELL controls.
 Custom BUY amount.
 Custom SELL percentage.
 CopyInstruction generation.
```

# 20. Remaining MVP Work
## Phase A — Copy Instruction Transport

### Goal:

Extension → Local Server

without executing anything.

### Tasks:

Add copy-trade to the server protocol.
Send CopyInstruction from the extension.
Validate it server-side.
Log the accepted instruction.
Validate:
trade ID exists;
action matches the original trade;
BUY amount is positive;
SELL percentage is 0–100.

### Checkpoint:

Click BUY $10 and SELL 50% and confirm the server receives the correct instructions.

## Phase B — Persist Recent Trade Data

### For the MVP:

Use chrome.storage.local.
Persist recent trades.
Persist tracked-wallet configuration.
Persist basic UI settings.

### Never persist:

private keys;
seed phrases;
wallet signing credentials.

## Phase C — WebSocket Reliability

Add:

Automatic reconnect.
Reconnect backoff.
Connection status.
Extension indication when the local server is unavailable.


## Phase D — User Wallet Connection

Initially support Phantom.

Flow:

```text
Extension
    ↓
Detect Phantom
    ↓
Connect
    ↓
Obtain public address
    ↓
Use connected wallet for copy operations
```

The wallet connection should eventually become authoritative rather than relying on a manually configured MY_WALLET_ADDRESS.

## Phase E — Build Copy-Buy Transaction

Flow:

```
Tracked BUY
    ↓
User selects "$10"
    ↓
Extension sends CopyInstruction
    ↓
Server validates
    ↓
Server constructs unsigned transaction
    ↓
Extension receives transaction
    ↓
Wallet signs
    ↓
Transaction submitted
    ↓
Status returned
```

The server constructs the transaction but must not sign it.

## Phase F — Build Copy-Sell Transaction

For SELL:

Tracked SELL
    ↓
User selects 50%
    ↓
Server checks user's token balance
    ↓
Calculate 50% of user's balance
    ↓
Construct unsigned sell transaction
    ↓
Wallet signs
    ↓
Submit

The sell amount is based on the user's current position, not the tracked wallet's token amount.

## Phase G — Transaction Status

The UI should show:

Preparing...
Waiting for approval...
Submitted...
Confirmed

or:

Failed

The server should return the transaction signature after submission.

## Phase H — Balance Refresh

After a successful copy:

Refresh SOL balance.
Refresh relevant token balance.
Update the popup.
Display resulting position.
28. Phase I — Transaction Safety

Before executing real transactions, add server-side validation.

BUY:

amount > 0;
maximum BUY limit;
sufficient SOL;
valid mint;
valid trade ID.

SELL:

percentage > 0;
percentage <= 100;
token balance exists;
calculated amount > 0;
valid mint.

Before wallet approval, display:

Action:
BUY

Token:
STONK

Amount:
$10.00

Estimated token amount:
...

Maximum spend:
...

Wallet:
...

Network:
Solana Mainnet

The wallet remains responsible for final approval.

## Phase J — Slippage and Transaction Parameters

Real copy trading cannot guarantee the tracked wallet's execution price.

The MVP needs transaction parameters such as:

input amount;
expected output;
maximum slippage;
priority fee;
compute budget.

Tracked trades should be treated as signals rather than guaranteed execution prices.

## Phase K — Improve Swap Coverage

Current detection is primarily Jupiter-based.

Before a broader release, investigate support for:

Direct Pump.fun trades.
PumpSwap/Pump.fun AMM.
Other relevant Solana DEX routes.

The parser should eventually identify swaps through transaction effects and known program/account patterns rather than depending exclusively on Jupiter.

Build a transaction fixture corpus for testing.

## Phase L — Error Handling

Add explicit error categories:

SERVER_OFFLINE
RPC_ERROR
PUMPFUN_API_ERROR
INVALID_TRADE
INSUFFICIENT_SOL
INSUFFICIENT_TOKEN_BALANCE
TRANSACTION_BUILD_FAILED
WALLET_REJECTED
TRANSACTION_FAILED
TRANSACTION_TIMEOUT

The extension should present useful user-facing messages while the server retains technical diagnostics.

## Phase M — Configuration

Potential settings:

Tracked wallet
Polling interval
RPC endpoint
Maximum BUY amount
Maximum SELL percentage
Default BUY amount
Default SELL percentage
Slippage
Priority fee

Keep the first implementation simple and local.

##  Phase N — Security

Before using meaningful funds:

```
Never store private keys.
Never request seed phrases.
Validate all WebSocket messages.
Treat localhost input as untrusted.
Validate Solana addresses.
Validate mint addresses.
Validate numeric inputs.
Cap transaction amounts.
Display transaction details before signing.
Use wallet-native signing.
Avoid arbitrary transaction execution.
Avoid accepting arbitrary serialized transactions without validation.
Consider binding the WebSocket server to 127.0.0.1.
Consider a local authentication/session token as the protocol becomes more capable.
```
34. Testing Strategy

Create deterministic parser fixtures for:

```
Jupiter BUY.
Jupiter SELL with WSOL proceeds.
SELL with native SOL proceeds.
Temporary WSOL account.
Token transfer with no SOL movement.
SOL-only transaction.
Failed transaction.
Multi-token swap.
Multiple SOL transfers.
Direct Pump.fun/PumpSwap trade.
```

Each fixture should assert:

detected/not detected
side
mint
token amount
SOL amount

Metadata and USD pricing should be tested separately.

# MVP Definition of Done

### The MVP is complete when the user can:

```
Start the local server.
Load the Chrome extension.
Connect their wallet.
Configure a tracked Pump.fun wallet.
See real tracked-wallet trades.
See:
token symbol;
BUY/SELL;
token amount;
SOL amount;
USD value;
timestamp.
Select a BUY preset/custom amount.
Select a SELL preset/custom percentage.
See a transaction confirmation screen.
Have the server construct the appropriate transaction.
Have the wallet request approval/signing.
Submit the transaction to Solana.
See success/failure.
See wallet/token balances update.
Continue receiving tracked-wallet events.
```

### Not required for MVP:

```
Cloud infrastructure.
User accounts.
Database.
Multi-user support.
Automated copy trading.
Trading strategy analysis.
Portfolio analytics.
Historical performance analysis.
Mobile support.
Multiple wallet providers.
```
##Recommended Implementation Order
37.
```
1. Copy instruction transport
       ↓
2. Persist extension state
       ↓
3. WebSocket reconnect/status
       ↓
4. Connect Phantom
       ↓
5. Build unsigned BUY transaction
       ↓
6. Sign + submit BUY
       ↓
7. Transaction status
       ↓
8. Build unsigned SELL transaction
       ↓
9. Sign + submit SELL
       ↓
10. Balance refresh
       ↓
11. Safety limits + confirmation UI
       ↓
12. Parser test fixtures
       ↓
13. Improve swap/program coverage
       ↓
14. MVP cleanup
```

Each stage should be validated before moving to the next.

## Immediate Next Step

The next implementation task is Copy Instruction Transport.

### Current:

Extension
    ↓
CopyInstruction

### Target:

Extension
    ↓
WebSocket
    ↓
Local server
    ↓
Validate CopyInstruction
    ↓
Log accepted instruction

No transaction construction or signing should be added during this step.

Once this is working reliably, transaction construction can be introduced behind the established protocol boundary.

# Core Design Principles
### Local-first

Keep the first version entirely local.

### Wallet-controlled signing

The application builds transactions; the wallet signs them.

### Server-owned blockchain logic

The extension should not need to understand Solana transaction parsing or Pump.fun APIs.

### Normalized events

The extension should consume a simple TradeEvent, not raw Solana transactions.

### Explicit user approval

A detected trade must never automatically spend the user's funds.

### Incremental complexity

Do not introduce cloud infrastructure, databases, accounts, or microservices until the local MVP demonstrates a need for them.

### Safety over convenience

