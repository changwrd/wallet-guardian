// Local-only page for the demo. Binds to 127.0.0.1, so nobody else can reach it or spend your keys.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { makeMemory, NullMemory } from "./memory.js";
import { evaluate } from "./guardian.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = "127.0.0.1";
const memory = makeMemory();
const off = new NullMemory();
let chain = null;
if (process.env.TATUM_API_KEY) {
  const { TatumSuiGrpc } = await import("./tatum-grpc.js");
  chain = new TatumSuiGrpc({ apiKey: process.env.TATUM_API_KEY });
}

const hex = (s) => "0x" + s.padEnd(64, "0");
const presets = [
  {
    name: "Real landlord (Ada)",
    to: hex("a1b2c3" + "9".repeat(52) + "d4e5"),
    amountSui: 12,
  },
  {
    name: "Lookalike of Ada",
    to: hex("a1b2c3" + "7".repeat(52) + "d4e5"),
    amountSui: 12,
  },
  {
    name: "Huge payment, new address",
    to: hex("ffee11" + "5".repeat(52) + "0099"),
    amountSui: 400,
  },
];
const ADDR = /^0x[0-9a-fA-F]{64}$/;
const okHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const okOrigins = new Set([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);

const readLedger = () => {
  try {
    return JSON.parse(fs.readFileSync(".data/ledger.json", "utf8"));
  } catch {
    return { verifiedWrites: [], unverified: 0 };
  }
};
const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
      if (d.length > 10000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(d || "{}"));
      } catch {
        reject(new Error("Bad JSON"));
      }
    });
  });
const parseTx = (b) => {
  if (typeof b.to !== "string" || !ADDR.test(b.to))
    throw new Error("Enter a full Sui address: 0x plus 64 hex characters.");
  const amountSui = Number(b.amountSui);
  if (!Number.isFinite(amountSui) || amountSui <= 0 || amountSui > 1e9)
    throw new Error("Enter an amount above 0.");
  return { to: b.to, amountSui };
};

http
  .createServer(async (req, res) => {
    try {
      if (!okHosts.has(req.headers.host))
        return send(res, 403, { error: "forbidden" });
      if (
        req.method === "POST" &&
        req.headers.origin &&
        !okOrigins.has(req.headers.origin)
      )
        return send(res, 403, { error: "forbidden" });
      const url = req.url.split("?")[0];

      if (req.method === "GET" && url === "/")
        return send(
          res,
          200,
          fs.readFileSync(path.resolve("public/index.html"), "utf8"),
          "text/html; charset=utf-8",
        );
      if (req.method === "GET" && url === "/api/info") {
        return send(res, 200, {
          memory: memory.backend,
          chain: chain
            ? "Tatum Sui mainnet (live gRPC)"
            : "none (no TATUM_API_KEY)",
          presets,
        });
      }
      if (req.method === "GET" && url === "/api/ledger") {
        const l = readLedger();
        return send(res, 200, {
          verified: l.verifiedWrites.length,
          unverified: l.unverified,
          recent: l.verifiedWrites.slice(-5).reverse(),
        });
      }
      if (req.method === "POST" && url === "/api/check") {
        const b = await readBody(req);
        const tx = parseTx(b);
        const mem = b.useMemory === false ? off : memory;
        const r = await evaluate(tx, { memory: mem, chain });
        return send(res, 200, {
          ...r,
          memory: mem.backend,
          chain: chain ? "live" : "none",
        });
      }
      if (req.method === "POST" && url === "/api/feedback") {
        const b = await readBody(req);
        const tx = parseTx(b);
        if (!["confirm", "reject"].includes(b.verdict))
          throw new Error("verdict must be confirm or reject");
        const label = String(b.label || "unnamed").slice(0, 40);
        const writes =
          b.verdict === "reject"
            ? [
                await memory.remember({
                  kind: "scam_flag",
                  address: tx.to,
                  reason: "rejected by owner",
                }),
              ]
            : [
                await memory.remember({
                  kind: "trusted_counterparty",
                  address: tx.to,
                  label,
                }),
                await memory.remember({
                  kind: "payment",
                  to: tx.to,
                  amountSui: tx.amountSui,
                }),
              ];
        return send(res, 200, { saved: writes });
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 400, { error: String(e.message || e).slice(0, 200) });
    }
  })
  .listen(PORT, HOST, () =>
    console.log(
      `Wallet Guardian page: http://localhost:${PORT}  (memory: ${memory.backend}, chain: ${chain ? "Tatum live" : "none"})`,
    ),
  );
