"use client";
import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics with PII redaction.
 * The check-in route is /checkin/[roomNumber], so the raw path would leak room
 * numbers into the analytics dashboard (a US sub-processor). `beforeSend` runs in
 * the browser before any event is sent — we collapse the room number to the route
 * pattern so we still get aggregate counts without ever transmitting the number.
 */
export default function AnalyticsSafe() {
  return (
    <Analytics
      beforeSend={(event) => {
        const url = event.url.replace(/\/checkin\/[^/?#]+/g, "/checkin/[room]");
        return { ...event, url };
      }}
    />
  );
}
