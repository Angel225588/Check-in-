import { describe, it, expect } from "vitest";
import { clientToRow, rowToClient, checkinToRow, rowToCheckin } from "../lib/sync/mappers";
import type { Client, CheckInRecord } from "../lib/types";
import type { Tables } from "../lib/database.types";

function client(over: Partial<Client>): Client {
  return {
    id: "cid-1", roomNumber: "101", roomType: "King", rtc: "", confirmationNumber: "ABC",
    name: "Alice", arrivalDate: "2026-06-20", departureDate: "2026-06-22", reservationStatus: "",
    adults: 2, children: 1, rateCode: "", packageCode: "BB", isVip: true, vipLevel: "Gold",
    vipNotes: "quiet table", vipSource: "breakfast_list", clientRev: 3, ...over,
  };
}

describe("sync mappers (column contract)", () => {
  it("clientToRow maps camel->snake, stamps location/rev/device/localKey, omits breakfast_included", () => {
    const row = clientToRow(client({}), { locationId: "loc-1", sessionId: "sess-1" });
    expect(row.id).toBe("cid-1");
    expect(row.location_id).toBe("loc-1");
    expect(row.session_id).toBe("sess-1");
    expect(row.room_number).toBe("101");
    expect(row.is_vip).toBe(true);
    expect(row.client_rev).toBe(3);
    expect(row.client_local_key).toBeTruthy();
    expect(row.device_id).toBeTruthy();
    expect("breakfast_included" in row).toBe(false); // DB default, never sent
  });

  it("client round-trips losslessly on key fields", () => {
    const original = client({});
    const row = clientToRow(original, { locationId: "loc-1", sessionId: null });
    // simulate the server returning the row with server-managed fields
    const serverRow = {
      ...row,
      created_at: "2026-06-20T00:00:00Z",
      updated_at: "2026-06-20T01:00:00Z",
      breakfast_included: true,
    } as unknown as Tables<"clients">;
    const back = rowToClient(serverRow);
    expect(back.id).toBe(original.id);
    expect(back.name).toBe(original.name);
    expect(back.roomNumber).toBe(original.roomNumber);
    expect(back.isVip).toBe(original.isVip);
    expect(back.vipLevel).toBe(original.vipLevel);
    expect(back.adults).toBe(original.adults);
    expect(back.clientRev).toBe(original.clientRev);
    expect(back.serverUpdatedAt).toBe("2026-06-20T01:00:00Z");
  });

  it("checkin round-trips and maps timestamp<->checked_in_at", () => {
    const ci: CheckInRecord = {
      id: "ck-1", roomNumber: "101", clientName: "Alice", peopleEntered: 2,
      timestamp: "2026-06-21T07:30:00Z", paymentAction: "points", clientRev: 1,
    };
    const row = checkinToRow(ci, { locationId: "loc-1", sessionId: "sess-1" });
    expect(row.checked_in_at).toBe("2026-06-21T07:30:00Z");
    expect(row.people_entered).toBe(2);
    expect("checked_in_by" in row).toBe(false); // server-managed, never sent
    const back = rowToCheckin({
      ...row, created_at: "x", updated_at: "y", checked_in_by: null, client_id: null,
    } as unknown as Tables<"checkins">);
    expect(back.id).toBe("ck-1");
    expect(back.peopleEntered).toBe(2);
    expect(back.timestamp).toBe("2026-06-21T07:30:00Z");
  });
});
