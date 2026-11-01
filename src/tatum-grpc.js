import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import path from "node:path";

const ROOT = path.resolve("proto");
const load = (file) =>
  grpc.loadPackageDefinition(
    protoLoader.loadSync(path.join(ROOT, file), {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [ROOT],
    }),
  ).sui.rpc.v2;

export class TatumSuiGrpc {
  constructor({ apiKey, host = "sui-mainnet-grpc.gateway.tatum.io:443" }) {
    if (!apiKey) throw new Error("TATUM_API_KEY is required");
    this.simulated = false;
    this.meta = new grpc.Metadata();
    this.meta.add("x-api-key", apiKey);
    const creds = grpc.credentials.createSsl();
    this.ledger = new (load("sui/rpc/v2/ledger_service.proto").LedgerService)(
      host,
      creds,
    );
    this.state = new (load("sui/rpc/v2/state_service.proto").StateService)(
      host,
      creds,
    );
  }
  call(client, method, req) {
    return new Promise((resolve, reject) =>
      client[method](
        req,
        this.meta,
        { deadline: Date.now() + 15000 },
        (err, res) => (err ? reject(err) : resolve(res)),
      ),
    );
  }
  serviceInfo() {
    return this.call(this.ledger, "GetServiceInfo", {});
  }
  async balanceSui(address) {
    const r = await this.call(this.state, "GetBalance", {
      owner: address,
      coin_type: "0x2::sui::SUI",
    });
    const b =
      r.balance && typeof r.balance === "object"
        ? r.balance.balance
        : r.balance;
    return Number(b ?? 0) / 1e9;
  }
  /** "Active" here means the address holds some SUI. */
  async hasActivity(address) {
    return (await this.balanceSui(address)) >= 0.001;
  }
}
