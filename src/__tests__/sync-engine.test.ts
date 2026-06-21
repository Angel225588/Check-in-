import { describe, it, expect, beforeEach } from "vitest";
import { flushOnce } from "../lib/sync/engine";
import { enqueue, peekAll, deadLetters, MAX_TRIES, type Mutation } from "../lib/sync/outbox";
import { VerifyError, ConfigError } from "../lib/verify-after-write";

function enqClient(id: string): Mutation {
  return enqueue({ entity: "client", op: "upsert", rowId: id, payload: { id } });
}

describe("flush engine (loop semantics)", () => {
  beforeEach(() => localStorage.clear());

  it("removes a mutation only after a successful apply (landed-proof)", async () => {
    enqClient("c1");
    const r = await flushOnce({ apply: async () => {} });
    expect(r.flushed).toBe(1);
    expect(peekAll()).toHaveLength(0);
  });

  it("conserves a mutation when apply throws (no silent loss)", async () => {
    enqClient("c1");
    const r = await flushOnce({
      apply: async () => { throw new VerifyError("not landed"); },
      backoffMs: () => 10_000,
    });
    expect(r.retried).toBe(1);
    expect(peekAll()).toHaveLength(1); // still queued
  });

  it("backs off: a retried mutation is excluded until its nextDueAt", async () => {
    enqClient("c1");
    const T = 1_000_000;
    await flushOnce({ apply: async () => { throw new VerifyError("x"); }, backoffMs: () => 10_000, now: () => T });
    // still backed off
    const r1 = await flushOnce({ apply: async () => {}, now: () => T });
    expect(r1.flushed).toBe(0);
    // past the backoff window
    const r2 = await flushOnce({ apply: async () => {}, now: () => T + 11_000 });
    expect(r2.flushed).toBe(1);
  });

  it("dead-letters a config error immediately (no retry)", async () => {
    enqClient("c1");
    const r = await flushOnce({ apply: async () => { throw new ConfigError("RLS denied"); } });
    expect(r.deadLettered).toBe(1);
    expect(peekAll()).toHaveLength(0);
    expect(deadLetters()).toHaveLength(1);
  });

  it("dead-letters a poison mutation after MAX_TRIES", async () => {
    enqClient("c1");
    for (let i = 0; i < MAX_TRIES; i++) {
      await flushOnce({ apply: async () => { throw new VerifyError("always fails"); }, backoffMs: () => 0 });
    }
    expect(peekAll()).toHaveLength(0);
    expect(deadLetters()).toHaveLength(1);
  });
});
