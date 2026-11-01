// Scripted before/after demo. Chain is SIMULATED and addresses are synthetic: this shows the mechanism,
// it is NOT a measurement on real users. Run with MEMORY_BACKEND=walrus to write real mainnet memories.
import fs from "node:fs";
import { LocalMemory, NullMemory, makeMemory } from "./memory.js";
import { SimulatedChain } from "./chain.js";
import { evaluate, recordFeedback } from "./guardian.js";
import { TatumSuiGrpc } from "./tatum-grpc.js";

const hex = (s) => "0x" + s.padEnd(64, "0");
const ADA = hex("a1b2c3" + "9".repeat(52) + "d4e5");
const ADA_FAKE = hex("a1b2c3" + "7".repeat(52) + "d4e5");
const NEW_BIG = hex("ffee11" + "5".repeat(52) + "0099");
const friends = [
  ["Ada (landlord)", ADA, [12, 12, 12]],
  ["Chidi", hex("c0ffee" + "1".repeat(52) + "0001"), [2, 3]],
  ["Tolu", hex("b0b0b0" + "2".repeat(52) + "0002"), [1, 1.5]],
  ["Ife", hex("d00d00" + "3".repeat(52) + "0003"), [5]],
  ["Zainab", hex("e1e1e1" + "4".repeat(52) + "0004"), [4, 2]],
];

const memoryOn =
  process.env.MEMORY_BACKEND === "walrus"
    ? makeMemory()
    : new LocalMemory(".data-demo");
if (memoryOn.reset) await memoryOn.reset();
const chain =
  process.env.USE_TATUM === "1" && process.env.TATUM_API_KEY
    ? new TatumSuiGrpc({ apiKey: process.env.TATUM_API_KEY })
    : new SimulatedChain([NEW_BIG]);

let writes = 0;
for (const [label, address, amounts] of friends) {
  await memoryOn.remember({ kind: "trusted_counterparty", address, label });
  writes++;
  for (const amountSui of amounts) {
    await memoryOn.remember({ kind: "payment", to: address, amountSui });
    writes++;
  }
}
console.log(`Seeded ${writes} memories (${memoryOn.backend}).\n`);

const scenarios = [
  {
    name: "Poisoned lookalike of landlord",
    tx: { to: ADA_FAKE, amountSui: 12 },
    expect: ["BLOCK"],
  },
  {
    name: "Normal rent to the real address",
    tx: { to: ADA, amountSui: 12 },
    expect: ["ALLOW"],
  },
  {
    name: "Huge payment to new, empty address",
    tx: { to: NEW_BIG, amountSui: 400 },
    expect: ["WARN", "BLOCK"],
  },
  {
    name: "Same address after owner rejected it",
    tx: { to: NEW_BIG, amountSui: 50 },
    expect: ["BLOCK"],
    afterReject: true,
  },
];

const off = new NullMemory();
const rows = [];
let okOff = 0,
  okOn = 0;
for (const s of scenarios) {
  if (s.afterReject)
    await recordFeedback(memoryOn, { to: NEW_BIG, amountSui: 400 }, "reject");
  const a = await evaluate(s.tx, { memory: off, chain });
  const b = await evaluate(s.tx, { memory: memoryOn, chain });
  okOff += s.expect.includes(a.decision);
  okOn += s.expect.includes(b.decision);
  rows.push({
    scenario: s.name,
    expected: s.expect.join("/"),
    memoryOff: a.decision,
    memoryOn: b.decision,
    reasonOn: b.reasons[0],
  });
}
console.table(rows.map(({ reasonOn, ...r }) => r));
for (const r of rows)
  console.log(`- ${r.scenario}: ${r.reasonOn ?? "no risk signals"}`);
console.log(
  `\nCorrect decisions: memory OFF ${okOff}/${scenarios.length}, memory ON ${okOn}/${scenarios.length}`,
);
fs.mkdirSync("results", { recursive: true });
fs.writeFileSync(
  "results/demo-evidence.json",
  JSON.stringify(
    {
      backend: memoryOn.backend,
      simulatedChain: chain.simulated,
      seeded: writes,
      rows,
      okOff,
      okOn,
    },
    null,
    2,
  ),
);
