// Memory backends. Every record is a JSON object with a `kind` field.
// kinds: trusted_counterparty | payment | scam_flag
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ledgerFile = (dir) => path.join(dir, "ledger.json");
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/** Offline backend. Writes are NEVER counted as Walrus mainnet writes. */
export class LocalMemory {
  constructor(dir = ".data") {
    this.dir = dir;
    this.file = path.join(dir, "memory.json");
    this.backend = "local";
  }
  async remember(rec) {
    const all = readJson(this.file, []);
    const full = { id: crypto.randomUUID(), ts: Date.now(), ...rec };
    all.push(full);
    writeJson(this.file, all);
    return { id: full.id, blobId: null, backend: "local" };
  }
  async recall(kind, limit = 100) {
    return readJson(this.file, [])
      .filter((r) => r.kind === kind)
      .reverse()
      .slice(0, limit);
  }
  async count() {
    return readJson(this.file, []).length;
  }
  async reset() {
    writeJson(this.file, []);
  }
}

/** Memory off: the stateless baseline for the before/after comparison. */
export class NullMemory {
  constructor() {
    this.backend = "none";
  }
  async remember() {
    return { id: null, blobId: null, backend: "none" };
  }
  async recall() {
    return [];
  }
  async count() {
    return 0;
  }
}

/**
 * Walrus Memory backend, using the public SDK: MemWal.create({ key, accountId, serverUrl, namespace }),
 * remember(text) -> job, waitForRememberJob(job.job_id), recall({ query, limit }).
 * recall() is SEMANTIC (not key lookup), so each record is stored as text "[guardian:<kind>] {json}" and
 * we filter by the parsed `kind` after recall. A write only enters the ledger after the job finished
 * AND a recall query returned the record; that ledger is the evidence for judges.
 * Not yet run against the live relayer from the build sandbox: run `npm run smoke` with your credentials.
 */
export class WalrusMemory {
  constructor({
    key,
    accountId,
    namespace = "wallet-guardian",
    serverUrl,
    dir = ".data",
    sdk = null,
  }) {
    Object.assign(this, { key, accountId, namespace, serverUrl, dir, sdk });
    this.backend = "walrus";
    this.client = null;
  }
  async connect() {
    if (this.client) return;
    const sdk = this.sdk ?? (await import("@mysten-incubation/memwal")); // npm i @mysten-incubation/memwal
    this.client = sdk.MemWal.create({
      key: this.key,
      accountId: this.accountId,
      serverUrl: this.serverUrl,
      namespace: this.namespace,
    });
  }
  async remember(rec) {
    await this.connect();
    const nonce = crypto.randomUUID();
    const full = { nonce, ts: Date.now(), ...rec };
    const job = await this.client.remember(
      `[guardian:${rec.kind}] ${JSON.stringify(full)}`,
    );
    const done = await this.client.waitForRememberJob(
      job.job_id ?? job.jobId ?? job,
    );
    const blobId =
      done?.blob_id ?? done?.blobId ?? job?.blob_id ?? job?.blobId ?? null;

    let found = false;
    for (let i = 0; i < 6 && !found; i++) {
      if (i) await new Promise((r) => setTimeout(r, 3000));
      found = (
        await this.recallRaw(
          `[guardian:${rec.kind}] ${JSON.stringify(full)}`,
          8,
        )
      ).some((r) => r.nonce === nonce);
    }
    const ledger = readJson(ledgerFile(this.dir), {
      verifiedWrites: [],
      unverified: 0,
    });
    if (found)
      ledger.verifiedWrites.push({
        nonce,
        blobId,
        jobId: job?.job_id ?? null,
        kind: rec.kind,
        ts: full.ts,
      });
    else ledger.unverified += 1;
    writeJson(ledgerFile(this.dir), ledger);
    return { id: nonce, blobId, backend: "walrus", verified: found };
  }
  async recallRaw(query, limit) {
    await this.connect();
    const res = await this.client.recall({ query, limit });
    const items = Array.isArray(res)
      ? res
      : (res?.results ?? res?.memories ?? []);
    return items
      .map((r) => {
        const text = typeof r === "string" ? r : (r.text ?? r.content ?? "");
        const i = text.indexOf("{");
        try {
          return JSON.parse(text.slice(i));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  async recall(kind, limit = 100) {
    return (await this.recallRaw(`guardian:${kind}`, limit)).filter(
      (r) => r.kind === kind,
    );
  }
  async count() {
    return readJson(ledgerFile(this.dir), { verifiedWrites: [] }).verifiedWrites
      .length;
  }
}

export function makeMemory(env = process.env) {
  if (env.MEMORY_BACKEND === "walrus") {
    if (!env.MEMWAL_KEY || !env.MEMWAL_ACCOUNT_ID)
      throw new Error(
        "MEMWAL_KEY and MEMWAL_ACCOUNT_ID are required for the walrus backend.",
      );
    return new WalrusMemory({
      key: env.MEMWAL_KEY,
      accountId: env.MEMWAL_ACCOUNT_ID,
      namespace: env.MEMWAL_NAMESPACE,
      serverUrl: env.MEMWAL_SERVER_URL,
    });
  }
  return new LocalMemory();
}
