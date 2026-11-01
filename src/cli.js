import { makeMemory } from "./memory.js";
import { TatumSuiGrpc } from "./tatum-grpc.js";
import { evaluate, recordFeedback } from "./guardian.js";

const [cmd, to, amount, extra] = process.argv.slice(2);
const usage =
  "usage: check <to> <amountSui> | confirm <to> <amountSui> <label> | reject <to> <amountSui>";
if (!cmd || !to || !amount) {
  console.log(usage);
  process.exit(1);
}
const memory = makeMemory();
const chain = process.env.TATUM_API_KEY
  ? new TatumSuiGrpc({ apiKey: process.env.TATUM_API_KEY })
  : null;
const tx = { to, amountSui: Number(amount) };
if (cmd === "check") {
  const r = await evaluate(tx, { memory, chain });
  console.log(`${r.decision} (risk ${r.score})`);
  r.reasons.forEach((x) => console.log(" -", x));
  if (!chain) console.log(" (no TATUM_API_KEY: on-chain check skipped)");
} else if (cmd === "confirm")
  console.log(await recordFeedback(memory, tx, "confirm", extra));
else if (cmd === "reject")
  console.log(await recordFeedback(memory, tx, "reject"));
else console.log(usage);
