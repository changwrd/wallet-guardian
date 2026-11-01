import { TatumSuiGrpc } from "../src/tatum-grpc.js";

const t = new TatumSuiGrpc({ apiKey: process.env.TATUM_API_KEY });
const info = await t.serviceInfo();
console.log(
  "connected to:",
  info.chain,
  "| checkpoint:",
  info.checkpoint_height,
);
const addr =
  process.argv[2] ||
  "0x294376e4a560f9e8d18faded6dc1b942d27e6ea9f60db2134ee2815e03d6535d";
console.log("balance (SUI):", await t.balanceSui(addr));
console.log(
  "random empty address holds SUI:",
  await t.hasActivity("0x" + "ab".repeat(32)),
);
process.exit(0);
