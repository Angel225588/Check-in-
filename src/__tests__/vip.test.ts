import { describe, it, expect } from "vitest";
import { Client, VipEntry } from "@/lib/types";
import { mergeVipIntoClients, deduplicateClients } from "@/lib/vip";

// === VIP Data Structure Tests ===

describe("VIP - Client type with VIP fields", () => {
  it("client can have VIP fields", () => {
    const client: Client = {
      roomNumber: "151",
      roomType: "EXST",
      rtc: "",
      confirmationNumber: "90485763",
      name: "RECKER DAVID LEE",
      arrivalDate: "06/03/26",
      departureDate: "10/03/26",
      reservationStatus: "CKIN",
      adults: 2,
      children: 0,
      rateCode: "10SWB6Z",
      packageCode: "",
      isVip: true,
      vipLevel: "X4",
      vipNotes: "Member Rate (M5), Res Qual For Free WiFi (W7)",
    };
    expect(client.isVip).toBe(true);
    expect(client.vipLevel).toBe("X4");
    expect(client.vipNotes).toBeTruthy();
  });

  it("client defaults to non-VIP", () => {
    const client: Client = {
      roomNumber: "101",
      roomType: "DLXK",
      rtc: "",
      confirmationNumber: "123456",
      name: "Regular Guest",
      arrivalDate: "05/03/26",
      departureDate: "07/03/26",
      reservationStatus: "CKIN",
      adults: 1,
      children: 0,
      rateCode: "",
      packageCode: "",
    };
    expect(client.isVip).toBeUndefined();
    expect(client.vipLevel).toBeUndefined();
  });
});

// === VIP Extraction validation ===

describe("VIP - Extraction validation", () => {
  it("validates a proper VIP entry", () => {
    const entry: VipEntry = {
      roomNumber: "151",
      name: "RECKER DAVID LEE",
      vipLevel: "X4",
      vipNotes: "Member Rate (M5)",
      confirmationNumber: "90485763",
      arrivalDate: "06/03/26",
      departureDate: "10/03/26",
      roomType: "EXST",
      adults: 2,
      children: 0,
      rateCode: "10SWB6Z",
    };
    expect(entry.roomNumber).toBeTruthy();
    expect(entry.name).toBeTruthy();
    expect(entry.vipLevel).toBeTruthy();
  });

  it("validates VIP entry requires roomNumber", () => {
    const validate = (e: Partial<VipEntry>) =>
      typeof e.roomNumber === "string" && e.roomNumber.length > 0;

    expect(validate({ roomNumber: "151", name: "Test" })).toBe(true);
    expect(validate({ roomNumber: "", name: "Test" })).toBe(false);
    expect(validate({ name: "Test" })).toBe(false);
  });

  it("handles multiple VIP levels from the report (X4, P6, etc.)", () => {
    const entries: VipEntry[] = [
      { roomNumber: "151", name: "RECKER", vipLevel: "X4", vipNotes: "", confirmationNumber: "", arrivalDate: "", departureDate: "", roomType: "", adults: 0, children: 0, rateCode: "" },
      { roomNumber: "209", name: "SIDDIAH", vipLevel: "P6", vipNotes: "", confirmationNumber: "", arrivalDate: "", departureDate: "", roomType: "", adults: 0, children: 0, rateCode: "" },
      { roomNumber: "409", name: "SI YONGLE", vipLevel: "P6", vipNotes: "", confirmationNumber: "", arrivalDate: "", departureDate: "", roomType: "", adults: 0, children: 0, rateCode: "" },
    ];
    expect(entries.filter((e) => e.vipLevel === "X4")).toHaveLength(1);
    expect(entries.filter((e) => e.vipLevel === "P6")).toHaveLength(2);
  });
});

// === VIP Merge Logic (using real function) ===

describe("VIP - Merge with existing client list", () => {
  const baseClients: Client[] = [
    {
      roomNumber: "151", roomType: "EXST", rtc: "", confirmationNumber: "90485763",
      name: "RECKER DAVID LEE", arrivalDate: "06/03/26", departureDate: "10/03/26",
      reservationStatus: "CKIN", adults: 2, children: 0, rateCode: "RACK", packageCode: "BKF GRP",
    },
    {
      roomNumber: "222", roomType: "DLXK", rtc: "", confirmationNumber: "30012302",
      name: "JEN JASON HAO WEI", arrivalDate: "03/03/26", departureDate: "10/03/26",
      reservationStatus: "CKIN", adults: 2, children: 0, rateCode: "BAR", packageCode: "",
    },
    {
      roomNumber: "500", roomType: "STHT", rtc: "", confirmationNumber: "999999",
      name: "NON VIP GUEST", arrivalDate: "01/03/26", departureDate: "05/03/26",
      reservationStatus: "DUOT", adults: 1, children: 0, rateCode: "", packageCode: "",
    },
  ];

  const vipEntries: VipEntry[] = [
    {
      roomNumber: "151", name: "RECKER DAVID LEE", vipLevel: "X4",
      vipNotes: "Member Rate (M5)", confirmationNumber: "90485763",
      arrivalDate: "06/03/26", departureDate: "10/03/26", roomType: "EXST",
      adults: 2, children: 0, rateCode: "10SWB6Z",
    },
    {
      roomNumber: "222", name: "JEN JASON HAO WEI", vipLevel: "P6",
      vipNotes: "Res Qual For Free WiFi (W7), Mobile Check-In",
      confirmationNumber: "30012302", arrivalDate: "03/03/26",
      departureDate: "10/03/26", roomType: "", adults: 2, children: 0, rateCode: "",
    },
    {
      roomNumber: "308", name: "ZAMANI REZA ADRIAN", vipLevel: "X4",
      vipNotes: "High Floor Room (H1)", confirmationNumber: "9779691",
      arrivalDate: "03/03/26", departureDate: "07/03/26", roomType: "",
      adults: 1, children: 0, rateCode: "12SWA6",
    },
  ];

  it("tags existing clients as VIP when room+name matches", () => {
    const result = mergeVipIntoClients(baseClients, vipEntries);
    const room151 = result.find((c) => c.roomNumber === "151");
    expect(room151?.isVip).toBe(true);
    expect(room151?.vipLevel).toBe("X4");
    expect(room151?.vipNotes).toBe("Member Rate (M5)");
  });

  it("preserves existing client data when tagging as VIP", () => {
    const result = mergeVipIntoClients(baseClients, vipEntries);
    const room151 = result.find((c) => c.roomNumber === "151");
    expect(room151?.packageCode).toBe("BKF GRP");
    expect(room151?.reservationStatus).toBe("CKIN");
  });

  it("adds new clients from VIP list when not in client list", () => {
    const result = mergeVipIntoClients(baseClients, vipEntries);
    const room308 = result.find((c) => c.roomNumber === "308");
    expect(room308).toBeDefined();
    expect(room308?.isVip).toBe(true);
    expect(room308?.vipLevel).toBe("X4");
    expect(room308?.name).toBe("ZAMANI REZA ADRIAN");
  });

  it("does not tag non-VIP clients", () => {
    const result = mergeVipIntoClients(baseClients, vipEntries);
    const room500 = result.find((c) => c.roomNumber === "500");
    expect(room500?.isVip).toBeUndefined();
    expect(room500?.vipLevel).toBeUndefined();
  });

  it("handles empty VIP list (no changes)", () => {
    const result = mergeVipIntoClients(baseClients, []);
    expect(result).toHaveLength(3);
    expect(result.every((c) => !c.isVip)).toBe(true);
  });

  it("handles empty client list (all VIPs become new clients)", () => {
    const result = mergeVipIntoClients([], vipEntries);
    expect(result).toHaveLength(3);
    expect(result.every((c) => c.isVip)).toBe(true);
  });

  it("does not duplicate clients when VIP matches existing", () => {
    const result = mergeVipIntoClients(baseClients, vipEntries);
    // 3 original + 1 new (308) = 4 total
    expect(result).toHaveLength(4);
  });

  it("does not mutate original client array", () => {
    const original = baseClients.map((c) => ({ ...c }));
    mergeVipIntoClients(baseClients, vipEntries);
    expect(baseClients).toEqual(original);
  });

  it("handles multiple VIPs matching same room+name (last wins)", () => {
    const dupeVips: VipEntry[] = [
      { roomNumber: "151", name: "RECKER DAVID LEE", vipLevel: "X4", vipNotes: "Note A", confirmationNumber: "", arrivalDate: "", departureDate: "", roomType: "", adults: 0, children: 0, rateCode: "" },
      { roomNumber: "151", name: "RECKER DAVID LEE", vipLevel: "P6", vipNotes: "Note B", confirmationNumber: "", arrivalDate: "", departureDate: "", roomType: "", adults: 0, children: 0, rateCode: "" },
    ];
    const result = mergeVipIntoClients(baseClients, dupeVips);
    const room151 = result.find((c) => c.roomNumber === "151");
    expect(room151?.vipLevel).toBe("P6");
    expect(result).toHaveLength(3);
  });

  it("keeps separate clients in same room as separate entries", () => {
    const sharedRoom: Client[] = [
      {
        roomNumber: "101", roomType: "DLXK", rtc: "", confirmationNumber: "111",
        name: "GUEST ALPHA", arrivalDate: "01/03/26", departureDate: "05/03/26",
        reservationStatus: "CKIN", adults: 1, children: 0, rateCode: "", packageCode: "",
      },
      {
        roomNumber: "101", roomType: "DLXK", rtc: "", confirmationNumber: "222",
        name: "GUEST BETA", arrivalDate: "01/03/26", departureDate: "05/03/26",
        reservationStatus: "CKIN", adults: 1, children: 0, rateCode: "", packageCode: "",
      },
    ];
    const vip: VipEntry[] = [
      { roomNumber: "101", name: "GUEST ALPHA", vipLevel: "X4", vipNotes: "", confirmationNumber: "", arrivalDate: "", departureDate: "", roomType: "", adults: 0, children: 0, rateCode: "" },
    ];
    const result = mergeVipIntoClients(sharedRoom, vip);
    expect(result).toHaveLength(2);
    const alpha = result.find((c) => c.name === "GUEST ALPHA");
    const beta = result.find((c) => c.name === "GUEST BETA");
    expect(alpha?.isVip).toBe(true);
    expect(beta?.isVip).toBeUndefined();
  });

  it("adds VIP as new entry when room matches but name differs (shared room)", () => {
    const clients: Client[] = [
      {
        roomNumber: "101", roomType: "DLXK", rtc: "", confirmationNumber: "111",
        name: "EXISTING GUEST", arrivalDate: "01/03/26", departureDate: "05/03/26",
        reservationStatus: "CKIN", adults: 1, children: 0, rateCode: "", packageCode: "",
        isVip: true, vipLevel: "X4", vipNotes: "",
      },
    ];
    const vip: VipEntry[] = [
      { roomNumber: "101", name: "DIFFERENT VIP GUEST", vipLevel: "P6", vipNotes: "High Floor", confirmationNumber: "333", arrivalDate: "", departureDate: "", roomType: "", adults: 1, children: 0, rateCode: "" },
    ];
    const result = mergeVipIntoClients(clients, vip);
    expect(result).toHaveLength(2);
    expect(result.filter((c) => c.isVip)).toHaveLength(2);
  });
});

// === Deduplication Logic ===

describe("VIP - Deduplication (multi-photo)", () => {
  it("deduplicates by room+name, keeping last occurrence", () => {
    const clients: Client[] = [
      { roomNumber: "101", name: "Guest One", roomType: "A", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0, rateCode: "", packageCode: "" },
      { roomNumber: "102", name: "Guest Two", roomType: "B", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0, rateCode: "", packageCode: "" },
      { roomNumber: "101", name: "Guest One", roomType: "C", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 2, children: 0, rateCode: "", packageCode: "" },
    ];
    const result = deduplicateClients(clients);
    expect(result).toHaveLength(2);
    // Last occurrence wins
    const g1 = result.find((c) => c.roomNumber === "101");
    expect(g1?.roomType).toBe("C");
  });

  it("keeps different clients in same room as separate", () => {
    const clients: Client[] = [
      { roomNumber: "101", name: "ALPHA GUEST", roomType: "", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0, rateCode: "", packageCode: "" },
      { roomNumber: "101", name: "BETA GUEST", roomType: "", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0, rateCode: "", packageCode: "" },
    ];
    const result = deduplicateClients(clients);
    expect(result).toHaveLength(2);
  });

  it("handles empty list", () => {
    expect(deduplicateClients([])).toHaveLength(0);
  });

  it("combines and deduplicates multiple batches", () => {
    const batch1: Client[] = [
      { roomNumber: "101", name: "Guest One", roomType: "", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0, rateCode: "", packageCode: "" },
      { roomNumber: "102", name: "Guest Two", roomType: "", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0, rateCode: "", packageCode: "" },
    ];
    const batch2: Client[] = [
      { roomNumber: "102", name: "Guest Two", roomType: "", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0, rateCode: "", packageCode: "" },
      { roomNumber: "201", name: "Guest Three", roomType: "", rtc: "", confirmationNumber: "", arrivalDate: "", departureDate: "", reservationStatus: "", adults: 2, children: 0, rateCode: "", packageCode: "" },
    ];
    const result = deduplicateClients([...batch1, ...batch2]);
    expect(result).toHaveLength(3);
  });

  it("handles up to 7 batches of images", () => {
    const batches: Client[][] = Array.from({ length: 7 }, (_, i) => [
      {
        roomNumber: String(100 + i), name: `Guest ${i}`,
        roomType: "", rtc: "", confirmationNumber: "", arrivalDate: "",
        departureDate: "", reservationStatus: "", adults: 1, children: 0,
        rateCode: "", packageCode: "",
      },
    ]);
    const result = deduplicateClients(batches.flat());
    expect(result).toHaveLength(7);
  });
});

// === Multi-photo file handling ===

describe("VIP - Multi-photo file handling", () => {
  it("validates max 7 files", () => {
    const maxFiles = 7;
    const files = Array.from({ length: 10 }, (_, i) =>
      new File(["test"], `photo${i}.jpg`, { type: "image/jpeg" })
    );
    const allowed = files.slice(0, maxFiles);
    expect(allowed).toHaveLength(7);
  });

  it("accepts multiple file types in same batch", () => {
    const files = [
      new File(["a"], "photo1.jpg", { type: "image/jpeg" }),
      new File(["b"], "photo2.png", { type: "image/png" }),
      new File(["c"], "photo3.webp", { type: "image/webp" }),
    ];
    expect(files.every((f) => f.type.startsWith("image/"))).toBe(true);
  });
});
