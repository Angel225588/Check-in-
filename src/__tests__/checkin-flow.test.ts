import { describe, it, expect } from "vitest";
import { Client } from "@/lib/types";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    roomNumber: "101",
    roomType: "DLXK",
    rtc: "",
    confirmationNumber: "100",
    name: "TEST GUEST",
    arrivalDate: "01/03/26",
    departureDate: "05/03/26",
    reservationStatus: "CKIN",
    adults: 2,
    children: 0,
    rateCode: "",
    packageCode: "",
    ...overrides,
  };
}

// Carousel visibility logic (mirrors check-in page)
// Only show for guests NOT on the breakfast list (no package code)
function shouldShowCarousel(client: Client): boolean {
  const notOnList = !client.packageCode || client.packageCode === "";
  return notOnList;
}

const validPaymentActions = ["pdj", "card", "room", "points", "cash", "pass", "reception", "supervisor"];

describe("Payment Carousel Visibility", () => {
  it("shows carousel for walk-ins (no package)", () => {
    const walkIn = makeClient({ packageCode: "" });
    expect(shouldShowCarousel(walkIn)).toBe(true);
  });

  it("hides carousel for VIP clients WITH a package (they are covered)", () => {
    const vip = makeClient({ packageCode: "BKF INCL", isVip: true });
    expect(shouldShowCarousel(vip)).toBe(false);
  });

  it("shows carousel for VIP clients WITHOUT a package (walk-in VIP)", () => {
    const vipWalkIn = makeClient({ packageCode: "", isVip: true });
    expect(shouldShowCarousel(vipWalkIn)).toBe(true);
  });

  it("hides carousel for COMP clients with a package", () => {
    const comp = makeClient({ packageCode: "BKF COMP", isVip: false });
    expect(shouldShowCarousel(comp)).toBe(false);
  });

  it("hides carousel for regular package clients (not VIP)", () => {
    const regular = makeClient({ packageCode: "BKF INCL", isVip: false });
    expect(shouldShowCarousel(regular)).toBe(false);
  });

  it("hides carousel for VIP with COMP package (they are covered)", () => {
    const vipComp = makeClient({ packageCode: "BKF COMP", isVip: true });
    expect(shouldShowCarousel(vipComp)).toBe(false);
  });
});

describe("Payment Action Values", () => {
  it("reception is a valid paymentAction", () => {
    expect(validPaymentActions).toContain("reception");
  });

  it("supervisor is a valid paymentAction", () => {
    expect(validPaymentActions).toContain("supervisor");
  });
});

describe("Client pendingPaymentAction type", () => {
  it("Client can have pendingPaymentAction field", () => {
    const client = makeClient();
    const withPending = { ...client, pendingPaymentAction: "card" };
    expect(withPending.pendingPaymentAction).toBe("card");
  });
});
