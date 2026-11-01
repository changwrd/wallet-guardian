import { TatumSui } from "../src/chain.js";

const chain = new TatumSui({
  apiKey: process.env.TATUM_API_KEY,
  url: process.env.TATUM_SUI_URL,
});
const mine = process.argv[2];
const empty = "0x" + "ab".repeat(32);

if (mine) {
  console.log("your address has activity:", await chain.hasActivity(mine));
  console.log("your balance (SUI):", await chain.balanceSui(mine));
}
console.log(
  "random empty address has activity:",
  await chain.hasActivity(empty),
);
