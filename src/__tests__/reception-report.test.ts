import { describe, it, expect } from "vitest";
import { Client, VipEntry, CheckInRecord } from "@/lib/types";
import { mergeVipIntoClients } from "@/lib/vip";
import {
  getReceptionWatchlist,
  ReceptionStatus,
} from "@/lib/reception-report";

function baseClient(over: Partial<Client> = {}): Client {
  return {
    roomNumber: "100",
    roomType: "DLXK",
    rtc: "",
    confirmationNumber: "",
    name: "Guest",
    arrivalDate: "",
    departureDate: "",
    reservationStatus: "",
    adults: 1,
    children: 0,
    rateCode: "",
    packageCode: "",
    ...over,
  };
}

function baseVip(over: Partial<VipEntry> = {}): VipEntry {
  return {
    roomNumber: "200",
    name: "VIP Guest",
    vipLevel: "Gold",
    vipNotes: "",
    confirmationNumber: "",
    arrivalDate: "",
    departureDate: "",
    roomType: "",
    adults: 1,
    children: 0,
    rateCode: "",
    ...over,
  };
}

describe("VIP source tagging on merge", () => {
  it("tags new VIP-only clients with vipSource='list_only'", () => {
    const breakfastClients: Client[] = [
      baseClient({ roomNumber: "100", name: "Alice", vipSource: "breakfast_list" }),
    ];
    const vips: VipEntry[] = [baseVip({ roomNumber: "999", name: "Bob VIP" })];

    const merged = mergeVipIntoClients(breakfastClients, vips);

    const bob = merged.find((c) => c.roomNumber === "999");
    expect(bob).toBeDefined();
    expect(bob!.vipSource).toBe("list_only");
    expect(bob!.isVip).toBe(true);
  });

  it("does NOT change vipSource when VIP matches an existing breakfast client", () => {
    const breakfastClients: Client[] = [
      baseClient({
        roomNumber: "100",
        name: "Alice Smith",
        vipSource: "breakfast_list",
      }),
    ];
    const vips: VipEntry[] = [baseVip({ roomNumber: "100", name: "Alice Smith" })];

    const merged = mergeVipIntoClients(breakfastClients, vips);

    const alice = merged.find((c) => c.roomNumber === "100");
    expect(alice).toBeDefined();
    expect(alice!.vipSource).toBe("breakfast_list");
    expect(alice!.isVip).toBe(true);
  });
});

describe("getReceptionWatchlist", () => {
  it("returns VIPs with vipSource='list_only' or 'walk_in'", () => {
    const clients: Client[] = [
      baseClient({ roomNumber: "100", name: "PDJ Guest", vipSource: "breakfast_list" }),
      baseClient({
        roomNumber: "200",
        name: "VIP Only",
        isVip: true,
        vipLevel: "Gold",
        vipSource: "list_only",
      }),
      baseClient({
        roomNumber: "300",
        name: "Walk-in",
        isVip: true,
        vipLevel: "Silver",
        vipSource: "walk_in",
      }),
      baseClient({
        roomNumber: "400",
        name: "VIP on PDJ",
        isVip: true,
        vipLevel: "Platinum",
        vipSource: "breakfast_list",
      }),
    ];

    const watchlist = getReceptionWatchlist(clients, []);

    expect(watchlist).toHaveLength(2);
    expect(watchlist.map((w) => w.roomNumber).sort()).toEqual(["200", "300"]);
  });

  it("falls back to ALL VIPs when no client has vipSource (legacy data)", () => {
    const clients: Client[] = [
      baseClient({
        roomNumber: "100",
        name: "Legacy VIP",
        isVip: true,
        vipLevel: "Gold",
      }),
      baseClient({ roomNumber: "200", name: "Non VIP" }),
    ];

    const watchlist = getReceptionWatchlist(clients, []);

    expect(watchlist).toHaveLength(1);
    expect(watchlist[0].roomNumber).toBe("100");
    expect(watchlist[0].isLegacyData).toBe(true);
  });

  it("derives status='not_yet' when no check-in exists", () => {
    const clients: Client[] = [
      baseClient({
        roomNumber: "200",
        name: "VIP Only",
        isVip: true,
        vipSource: "list_only",
      }),
    ];

    const watchlist = getReceptionWatchlist(clients, []);
    expect(watchlist[0].status).toBe<ReceptionStatus>("not_yet");
  });

  it("derives status from paymentAction when checked-in", () => {
    const clients: Client[] = [
      baseClient({
        roomNumber: "200",
        name: "VIP Points",
        isVip: true,
        vipSource: "list_only",
      }),
      baseClient({
        roomNumber: "201",
        name: "VIP Paid",
        isVip: true,
        vipSource: "list_only",
      }),
      baseClient({
        roomNumber: "202",
        name: "VIP Comp",
        isVip: true,
        vipSource: "list_only",
        packageCode: "BKF COMP",
      }),
    ];
    const checkIns: CheckInRecord[] = [
      {
        id: "1",
        roomNumber: "200",
        clientName: "VIP Points",
        peopleEntered: 1,
        timestamp: "2026-04-30T08:15:00Z",
        paymentAction: "points",
      },
      {
        id: "2",
        roomNumber: "201",
        clientName: "VIP Paid",
        peopleEntered: 1,
        timestamp: "2026-04-30T08:20:00Z",
        paymentAction: "pay_onsite",
      },
      {
        id: "3",
        roomNumber: "202",
        clientName: "VIP Comp",
        peopleEntered: 1,
        timestamp: "2026-04-30T08:25:00Z",
      },
    ];

    const watchlist = getReceptionWatchlist(clients, checkIns);
    const byRoom = Object.fromEntries(watchlist.map((w) => [w.roomNumber, w]));

    expect(byRoom["200"].status).toBe<ReceptionStatus>("came_points");
    expect(byRoom["201"].status).toBe<ReceptionStatus>("came_paid_onsite");
    expect(byRoom["202"].status).toBe<ReceptionStatus>("came_compliment");
  });

  it("includes check-in time when available", () => {
    const clients: Client[] = [
      baseClient({
        roomNumber: "200",
        name: "VIP",
        isVip: true,
        vipSource: "list_only",
      }),
    ];
    const checkIns: CheckInRecord[] = [
      {
        id: "1",
        roomNumber: "200",
        clientName: "VIP",
        peopleEntered: 1,
        timestamp: "2026-04-30T08:15:00Z",
        paymentAction: "points",
      },
    ];

    const watchlist = getReceptionWatchlist(clients, checkIns);
    expect(watchlist[0].checkInTimestamp).toBe("2026-04-30T08:15:00Z");
    expect(watchlist[0].peopleEntered).toBe(1);
  });
});
