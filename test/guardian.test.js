import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LocalMemory, NullMemory } from '../src/memory.js';
import { SimulatedChain } from '../src/chain.js';
import { evaluate, isLookalike, recordFeedback } from '../src/guardian.js';

const hex = (s) => '0x' + s.padEnd(64, '0');
const REAL = hex('a1b2c3' + '9'.repeat(52) + 'd4e5');
const FAKE = hex('a1b2c3' + '7'.repeat(52) + 'd4e5');
const dir = '.data-test';
const fresh = async () => { fs.rmSync(dir, { recursive: true, force: true }); const m = new LocalMemory(dir);
  await m.remember({ kind: 'trusted_counterparty', address: REAL, label: 'Ada' }); await m.remember({ kind: 'payment', to: REAL, amountSui: 12 }); return m; };
const chain = new SimulatedChain();

test('lookalike detection', () => { assert.ok(isLookalike(REAL, FAKE)); assert.ok(!isLookalike(REAL, REAL)); });
test('memory ON blocks poisoned twin, memory OFF does not', async () => {
  const on = await evaluate({ to: FAKE, amountSui: 12 }, { memory: await fresh(), chain });
  const off = await evaluate({ to: FAKE, amountSui: 12 }, { memory: new NullMemory(), chain });
  assert.equal(on.decision, 'BLOCK'); assert.notEqual(off.decision, 'BLOCK');
});
test('known address, usual amount is allowed', async () => {
  assert.equal((await evaluate({ to: REAL, amountSui: 12 }, { memory: await fresh(), chain })).decision, 'ALLOW');
});
test('rejecting an address makes later payments to it blocked', async () => {
  const m = await fresh(); const tx = { to: hex('123456' + '8'.repeat(52) + 'abcd'), amountSui: 3 };
  await recordFeedback(m, tx, 'reject');
  assert.equal((await evaluate(tx, { memory: m, chain })).decision, 'BLOCK');
});

test('WalrusMemory ledger counts a write only after job + recall confirm it', async () => {
  const { WalrusMemory } = await import('../src/memory.js');
  const store = [];
  const fakeSdk = { MemWal: { create: () => ({
    remember: async (t) => { store.push(t); return { job_id: 'j1' }; },
    waitForRememberJob: async () => ({ blob_id: 'blob123' }),
    recall: async ({ query }) => ({ results: store.filter((t) => t.includes(query.replace('guardian:', '')) ).map((text) => ({ text })) }),
  }) } };
  fs.rmSync('.data-wtest', { recursive: true, force: true });
  const w = new WalrusMemory({ key: 'k', accountId: '0x1', dir: '.data-wtest', sdk: fakeSdk });
  const r = await w.remember({ kind: 'trusted_counterparty', address: REAL, label: 'Ada' });
  assert.equal(r.verified, true); assert.equal(r.blobId, 'blob123'); assert.equal(await w.count(), 1);
  assert.equal((await w.recall('trusted_counterparty')).length, 1);
  fs.rmSync('.data-wtest', { recursive: true, force: true });
});
