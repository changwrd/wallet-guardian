import { TatumSuiGrpc } from "../src/tatum-grpc.js";

const t = new TatumSuiGrpc({ apiKey: process.env.TATUM_API_KEY });
for (const owner of [
  "0x294376e4a560f9e8d18faded6dc1b942d27e6ea9f60db2134ee2815e03d6535d",
  "0x" + "ab".repeat(32),
  "0x" + "00".repeat(31) + "77",
]) {
  const r = await t.call(t.state, "GetBalance", {
    owner,
    coin_type: "0x2::sui::SUI",
  });
  console.log(owner.slice(0, 10) + "…", JSON.stringify(r));
}
process.exit(0);
