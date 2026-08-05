/**
 * How many result rows are worth drawing.
 *
 * One digit into a full house matches roughly a third of it. Drawing all of
 * them cost 106ms on a desktop — several times that on the iPad — on the very
 * keystroke that has to feel instant, and produced a list too long to be read
 * by someone standing with a queue in front of them. The second digit cuts it
 * to a handful anyway, so the tail was never going to be looked at.
 *
 * Thirty is about three screens on a phone: enough that scrolling is a real
 * option, short enough that it costs nothing.
 *
 * The cap is never silent. Whatever is not drawn is counted and said out loud,
 * because a list that quietly stops is a list that lies about the day.
 */
export const ROW_CAP = 30;

export function capRows<T>(rows: T[], max: number = ROW_CAP): { shown: T[]; more: number } {
  if (rows.length <= max) return { shown: rows, more: 0 };
  return { shown: rows.slice(0, max), more: rows.length - max };
}
