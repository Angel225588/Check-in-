import { Client, CheckInRecord } from "@/lib/types";
import { formuleOf, type Formule } from "@/lib/report-v2";
import { isComp } from "@/lib/utils";

/** Same test the report uses, so one morning cannot be "inclus" on the guest
 *  page and something else in the briefing. */
function hasBreakfastPackage(client: Client): boolean {
  return /BKF\s*(COMP|INC|GRP|EXCL|GTT)|UPSFPDJ/.test(client.packageCode.toUpperCase());
}

const key = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * How a past stay's breakfast was covered — or null if they never came down.
 *
 * The answer was already stored: reception's choice at the door is saved on
 * the check-in record, and the closed session keeps both. It had simply never
 * been read back, so every past stay said "1 pers · ch. 718" and nothing about
 * whether it went on the room, on a card, or was given away.
 *
 * Null, not "à encaisser", when there is no check-in that morning. A guest who
 * did not come down did not decline to pay; the row says "pas descendu" and
 * claims nothing.
 *
 * Matched on the guest, not the door: someone moved overnight is the same
 * person, which is the rule US-15 already follows.
 */
export function stayFormule(client: Client, checkIns: CheckInRecord[]): Formule | null {
  const mine = checkIns.filter(
    (c) => c.roomNumber === client.roomNumber || key(c.clientName) === key(client.name)
  );
  if (mine.length === 0) return null;

  const entered = mine.reduce((sum, c) => sum + (c.peopleEntered || 0), 0);
  // The last decision of the morning wins: a room charged then corrected to
  // cash is a cash morning.
  const paymentAction = [...mine].reverse().find((c) => c.paymentAction)?.paymentAction;

  return formuleOf({
    isComp: isComp(client),
    hasBreakfast: hasBreakfastPackage(client),
    entered,
    paymentAction,
  });
}
