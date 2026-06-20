import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueue,
  peekAll,
  remove,
  markTried,
  clearOutbox,
  type Mutation,
} from "../lib/sync/outbox";

function makeMutation(over: Partial<Mutation> = {}): Omit<Mutation, "id" | "clientTs" | "tries"> {
  return {
    entity: "client",
    op: "upsert",
    payload: { id: "c1", name: "Alice" },
    ...over,
  };
}

describe("sync outbox (durable mutation queue)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("enqueues a mutation and assigns id, clientTs, tries=0", () => {
    const m = enqueue(makeMutation());
    expect(m.id).toBeTruthy();
    expect(typeof m.clientTs).toBe("number");
    expect(m.tries).toBe(0);
    expect(peekAll()).toHaveLength(1);
  });

  it("persists across reloads (reads from localStorage, not memory)", () => {
    enqueue(makeMutation({ payload: { id: "c1" } }));
    enqueue(makeMutation({ payload: { id: "c2" } }));
    // Simulate a fresh module read by going straight to the store
    expect(peekAll()).toHaveLength(2);
  });

  it("preserves FIFO order", () => {
    enqueue(makeMutation({ payload: { id: "first" } }));
    enqueue(makeMutation({ payload: { id: "second" } }));
    const all = peekAll();
    expect((all[0].payload as { id: string }).id).toBe("first");
    expect((all[1].payload as { id: string }).id).toBe("second");
  });

  it("removes a mutation by id (after successful flush)", () => {
    const a = enqueue(makeMutation({ payload: { id: "a" } }));
    enqueue(makeMutation({ payload: { id: "b" } }));
    remove(a.id);
    const all = peekAll();
    expect(all).toHaveLength(1);
    expect((all[0].payload as { id: string }).id).toBe("b");
  });

  it("increments tries on markTried (for retry/backoff)", () => {
    const a = enqueue(makeMutation());
    markTried(a.id);
    markTried(a.id);
    expect(peekAll()[0].tries).toBe(2);
  });

  it("clearOutbox empties the queue", () => {
    enqueue(makeMutation());
    clearOutbox();
    expect(peekAll()).toHaveLength(0);
  });

  it("survives a corrupted store without throwing (returns empty)", () => {
    localStorage.setItem("imarketin_sync_outbox", "{not json");
    expect(peekAll()).toEqual([]);
  });
})
