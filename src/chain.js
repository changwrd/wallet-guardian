// Chain checks. TatumSui reads Sui mainnet through Tatum's gateway; SimulatedChain is for offline demos.
// ASSUMPTION TO CHECK: gateway URL and JSON-RPC methods follow Tatum/Sui conventions; confirm in the Tatum dashboard.
export class TatumSui {
  constructor({ apiKey, url = "https://sui-mainnet.gateway.tatum.io" }) {
    if (!apiKey) throw new Error("TATUM_API_KEY is required");
    this.apiKey = apiKey;
    this.url = url;
    this.simulated = false;
  }
  async rpc(method, params) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Tatum HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    if (body.error)
      throw new Error(`Tatum RPC ${method}: ${body.error.message}`);
    if (body.result === undefined)
      throw new Error(
        `Tatum HTTP ${res.status}, no result: ${text.slice(0, 300)}`,
      );
    return body.result;
  }
  /** True if the address has ever sent or received a transaction. */
  async hasActivity(address) {
    for (const filter of [{ FromAddress: address }, { ToAddress: address }]) {
      const r = await this.rpc("suix_queryTransactionBlocks", [
        { filter },
        null,
        1,
        false,
      ]);
      if (r.data?.length) return true;
    }
    return false;
  }
  async balanceSui(address) {
    return (
      Number((await this.rpc("suix_getBalance", [address])).totalBalance) / 1e9
    );
  }
}

export class SimulatedChain {
  constructor(inactive = []) {
    this.inactive = new Set(inactive);
    this.simulated = true;
  }
  async hasActivity(address) {
    return !this.inactive.has(address);
  }
}
