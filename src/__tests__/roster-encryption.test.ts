/**
 * End-to-end proof that the roster is encrypted at rest.
 *
 * Drives the real storage API the app uses, then inspects what is actually on
 * disk. The unit tests for `secure-store` check the mechanism; this checks the
 * outcome — that a stolen tablet dump yields nothing readable, and that the app
 * still works across a reload.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  saveClients, addCheckIn, getTodayData, closeDay, getSessionHistory,
} from "@/lib/storage";
import { recordGuestVisit, findGuest } from "@/lib/guests";
import {
  __resetSecureStore, hydrateSecureStore, flushSecureStore, getHydrationMs,
} from "@/lib/secure-store";
import { __resetKeyCache } from "@/lib/notes-crypto";
import type { Client } from "@/lib/types";

const mk = (room: string, name: string): Client => ({
  roomNumber: room, name, arrivalDate: "11/03/26", departureDate: "14/03/26",
  adults: 2, children: 0, rateCode: "BAR", packageCode: "BKF INC",
  vipNotes: "", vipSource: "breakfast_list",
});

/** Everything a stolen device dump would contain. */
function diskDump(): string {
  let out = "";
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    out += k + " " + (localStorage.getItem(k) ?? "") + " ";
  }
  return out;
}

beforeEach(() => {
  localStorage.clear();
  __resetSecureStore();
  __resetKeyCache();
});

describe("a real morning, then someone copies the tablet's storage", () => {
  it("leaks no guest name, room number or allergy", async () => {
    saveClients([
      mk("412", "DUPONT, MARIE"),
      { ...mk("108", "CHEN, WEI LING"), vipNotes: "allergie arachide severe", isVip: true },
    ]);
    addCheckIn({ id: "c1", roomNumber: "412", clientName: "DUPONT, MARIE", peopleEntered: 2, timestamp: new Date().toISOString() });
    recordGuestVisit("DUPONT, MARIE", "412");
    await flushSecureStore();

    const dump = diskDump();
    for (const secret of ["DUPONT", "MARIE", "CHEN", "WEI LING", "arachide", "412", "108"]) {
      expect(dump.includes(secret), `"${secret}" is readable on disk`).toBe(false);
    }
  });

  it("still leaks nothing after the day is closed into history", async () => {
    saveClients([mk("412", "DUPONT, MARIE")]);
    addCheckIn({ id: "c1", roomNumber: "412", clientName: "DUPONT, MARIE", peopleEntered: 2, timestamp: new Date().toISOString() });
    closeDay();
    await flushSecureStore();

    const dump = diskDump();
    expect(dump).not.toMatch(/DUPONT|MARIE/);
    expect(getSessionHistory()[0].clients[0].name).toBe("DUPONT, MARIE");
  });
});

describe("the app still works", () => {
  it("reads the roster back after a reload", async () => {
    saveClients([mk("412", "DUPONT, MARIE"), mk("108", "CHEN, WEI LING")]);
    addCheckIn({ id: "c1", roomNumber: "412", clientName: "DUPONT, MARIE", peopleEntered: 2, timestamp: new Date().toISOString() });
    await flushSecureStore();

    // Reload: memory is gone, only the disk survives.
    __resetSecureStore();
    await hydrateSecureStore();

    const day = getTodayData()!;
    expect(day.clients.map((c) => c.name)).toEqual(["DUPONT, MARIE", "CHEN, WEI LING"]);
    expect(day.checkIns).toHaveLength(1);
  });

  it("still recognises a returning guest after a reload", async () => {
    recordGuestVisit("DUPONT, MARIE", "412");
    recordGuestVisit("DUPONT, MARIE", "208");
    await flushSecureStore();

    __resetSecureStore();
    await hydrateSecureStore();
    expect(findGuest("DUPONT, MARIE")?.visitCount).toBe(1); // same day, not double-counted
    expect(findGuest("DUPONT, MARIE")?.roomHistory).toContain("208");
  });

  it("adopts a tablet that is already in service, without losing the morning", async () => {
    // Every device in the field has plaintext today. Upgrading must not look
    // like every guest vanishing.
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(`dailyData_${today}`, JSON.stringify({
      date: today, clients: [mk("412", "DUPONT, MARIE")], checkIns: [], discrepancies: [],
    }));

    await hydrateSecureStore();
    expect(getTodayData()!.clients[0].name).toBe("DUPONT, MARIE");

    await flushSecureStore();
    expect(diskDump()).not.toMatch(/DUPONT/);
  });

  it("reports an unlock time", async () => {
    saveClients([mk("412", "DUPONT, MARIE")]);
    await flushSecureStore();
    __resetSecureStore();
    await hydrateSecureStore();
    expect(getHydrationMs()).toBeGreaterThanOrEqual(0);
  });
});

describe("the storage win", () => {
  it("stores a full house in less space than the plaintext took", async () => {
    // iPad quota exhaustion is a real failure mode for this app. The envelope
    // gzips before encrypting, so protecting the data also shrinks it.
    const clients = Array.from({ length: 300 }, (_, i) => mk(String(100 + i), "DUPONT, MARIE"));
    const plaintextSize = JSON.stringify(clients).length;
    saveClients(clients);
    await flushSecureStore();

    const today = new Date().toISOString().split("T")[0];
    expect(localStorage.getItem(`dailyData_${today}`)!.length).toBeLessThan(plaintextSize);
  });
});
