// Core logic: score a proposed payment using what the guardian remembers about the owner.
const norm = (a) => a.toLowerCase().replace(/^0x/, "");

/** Address poisoning: same visible start and end, different address in the middle. */
export function isLookalike(a, b) {
  const x = norm(a),
    y = norm(b);
  return (
    x !== y &&
    x.length === y.length &&
    x.slice(0, 6) === y.slice(0, 6) &&
    x.slice(-4) === y.slice(-4)
  );
}
const median = (xs) => {
  const s = [...xs].sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

export async function loadProfile(memory) {
  const [trusted, payments, scams] = await Promise.all([
    memory.recall("trusted_counterparty"),
    memory.recall("payment"),
    memory.recall("scam_flag"),
  ]);
  return { trusted, payments, scams };
}

/** tx = { to, amountSui }. Returns { decision, score, reasons[], usedMemory } */
export async function evaluate(tx, { memory, chain }) {
  const { trusted, payments, scams } = await loadProfile(memory);
  const reasons = [];
  let score = 0;
  const to = norm(tx.to);

  if (scams.some((s) => norm(s.address) === to)) {
    score += 100;
    reasons.push("Address was flagged as a scam earlier.");
  }

  const exact = trusted.find((t) => norm(t.address) === to);
  const twin = trusted.find((t) => isLookalike(t.address, tx.to));
  if (twin) {
    score += 80;
    reasons.push(
      `Looks like "${twin.label}" (${twin.address.slice(0, 8)}…${twin.address.slice(-4)}) but is a different address.`,
    );
  }
  if (!exact && !twin) {
    score += 30;
    reasons.push("First time paying this address.");
  }

  const history = payments
    .filter((p) => norm(p.to) === to)
    .map((p) => p.amountSui);
  const baseline = history.length
    ? median(history)
    : median(payments.map((p) => p.amountSui));
  if (baseline && tx.amountSui > baseline * 5) {
    score += 30;
    reasons.push(
      `Amount is ${(tx.amountSui / baseline).toFixed(1)}x your usual (${baseline} SUI).`,
    );
  }

  if (chain && !(await chain.hasActivity(tx.to))) {
    score += 25;
    reasons.push("Address holds almost no SUI (checked live through Tatum).");
  }

  const decision = score >= 70 ? "BLOCK" : score >= 40 ? "WARN" : "ALLOW";
  return { decision, score, reasons, usedMemory: memory.backend !== "none" };
}

/** The owner's answer is itself memory: confirm trusts the address, reject flags it. */
export async function recordFeedback(memory, tx, verdict, label = "unnamed") {
  if (verdict === "reject")
    return memory.remember({
      kind: "scam_flag",
      address: tx.to,
      reason: "rejected by owner",
    });
  await memory.remember({
    kind: "trusted_counterparty",
    address: tx.to,
    label,
  });
  return memory.remember({
    kind: "payment",
    to: tx.to,
    amountSui: tx.amountSui,
  });
}
