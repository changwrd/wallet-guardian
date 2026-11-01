// Run first, with your real credentials: npm run smoke
// Proves the full loop on Walrus mainnet: write -> wait for job -> recall. Prints the evidence.
import { makeMemory } from '../src/memory.js';
if (process.env.MEMORY_BACKEND !== 'walrus') { console.error('Set MEMORY_BACKEND=walrus in .env'); process.exit(1); }
const m = makeMemory();
const probe = '0x' + 'ab'.repeat(32);
const w = await m.remember({ kind: 'trusted_counterparty', address: probe, label: 'smoke-test' });
console.log('write ->', w);
const back = await m.recall('trusted_counterparty', 10);
const ok = back.some((r) => r.address === probe);
console.log(ok ? 'RECALL OK: the record came back from Walrus.' : 'RECALL MISSING: see README troubleshooting.');
console.log('verified writes in ledger:', await m.count());
process.exit(ok ? 0 : 2);
