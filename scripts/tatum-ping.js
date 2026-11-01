const url = process.env.TATUM_SUI_URL || "https://sui-mainnet.gateway.tatum.io";
const addr =
  process.argv[2] ||
  "0x294376e4a560f9e8d18faded6dc1b942d27e6ea9f60db2134ee2815e03d6535d";
const calls = [
  ["sui_getLatestCheckpointSequenceNumber", []],
  ["suix_getBalance", [addr]],
  [
    "suix_queryTransactionBlocks",
    [{ filter: { FromAddress: addr } }, null, 1, false],
  ],
];
for (const [method, params] of calls) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.TATUM_API_KEY,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  console.log(method, "->", res.status, (await res.text()).slice(0, 160));
}
