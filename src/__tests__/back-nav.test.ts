import { describe, it, expect, beforeEach } from "vitest";
import { rememberOrigin, takeOrigin, peekOrigin } from "@/lib/back-nav";

describe("where back goes", () => {
  beforeEach(() => sessionStorage.clear());

  it("returns to search when nothing said otherwise", () => {
    expect(takeOrigin()).toBe("/search");
  });

  it("returns to the report when that is where you came from", () => {
    rememberOrigin("report");
    expect(takeOrigin()).toBe("/report");
  });

  // Reading consumes it. Otherwise a guest opened from the report at 09:00
  // still sends you back to the report at 11:00, from a screen you reached
  // from the keypad.
  it("does not survive being read", () => {
    rememberOrigin("report");
    expect(takeOrigin()).toBe("/report");
    expect(takeOrigin()).toBe("/search");
  });

  it("can be read without being consumed, for the label", () => {
    rememberOrigin("report");
    expect(peekOrigin()).toBe("report");
    expect(peekOrigin()).toBe("report");
    expect(takeOrigin()).toBe("/report");
  });

  it("survives a hostile storage without throwing", () => {
    const real = sessionStorage.setItem;
    sessionStorage.setItem = () => { throw new Error("private mode"); };
    expect(() => rememberOrigin("report")).not.toThrow();
    sessionStorage.setItem = real;
  });
});
