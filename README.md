# Wallet Guardian

A Sui wallet guardian that **learns how you pay** and stops mistakes before they are signed.
Built for the Tatum × Walrus **Total Recall** hackathon (track: Smart Agents for Real Life).

**The problem:** address-poisoning scams send dust from an address that matches the start and end of one you
really use, hoping you copy it from your history. A stateless agent cannot tell the difference. A guardian that
remembers who you actually pay can.

## How it works

1. **Remember** (Walrus Memory): trusted counterparties, past payments, and your confirm/reject decisions.
2. **Check** (Tatum): a live Sui mainnet balance lookup over gRPC. An address holding almost no SUI is a risk signal.
3. **Decide**: ALLOW / WARN / BLOCK with plain-language reasons.
4. **Learn**: your answer is stored. A rejected address is blocked next time.

## Run it

Offline demo (simulated chain, local memory):

```
node src/demo.js
npm test
```

Live demo (Walrus mainnet + Tatum mainnet). Copy `.env.example` to `.env` and set `MEMORY_BACKEND=walrus`,
`MEMWAL_KEY`, `MEMWAL_ACCOUNT_ID`, `TATUM_API_KEY`. Download the `proto` folder from
github.com/MystenLabs/sui-apis into this project, then:

```
npm install
npm run smoke          # write -> wait -> recall on Walrus
set USE_TATUM=1        # PowerShell: $env:USE_TATUM='1'
npm run demo:live
node --env-file=.env src/cli.js check <address> <amountSui>
```

## Status (honest)

| Area                                                  | Implemented | Tested        | Live-verified                                      |
| ----------------------------------------------------- | ----------- | ------------- | -------------------------------------------------- |
| Risk engine (lookalike, new payee, amount, flagged)   | yes         | yes (5 tests) | n/a                                                |
| Learn from confirm / reject                           | yes         | yes           | yes (live demo)                                    |
| Walrus Memory backend (job + recall-confirmed ledger) | yes         | yes           | **yes: 16+ verified mainnet writes with blob IDs** |
| Tatum Sui check (gRPC GetBalance, mainnet)            | yes         | yes           | **yes: live calls in `npm run demo:live`**         |

Demo addresses are synthetic. They are empty on mainnet, so the live Tatum check flags them, which makes the
memory-off baseline look worse than it would for real users. Treat the results as a mechanism demo, not an accuracy
measurement. With the simulated chain the comparison is memory off 2/4 versus memory on 4/4.

## Evidence

`.data/ledger.json` lists each verified Walrus write with its blob ID. `results/demo-evidence.json` records the latest demo run.
