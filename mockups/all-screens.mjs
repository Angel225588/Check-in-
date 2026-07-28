/**
 * Screenshot every screen of the real app, dark and light, at tablet landscape.
 *
 * The point is to look at what the browser actually paints. Three of the worst
 * bugs in this redesign — a crash page, dark-on-dark text, a clipped name —
 * were invisible to the build, the types, and the unit tests, and obvious in a
 * screenshot.
 *
 *   BASE_URL=http://localhost:4120 node mockups/all-screens.mjs
 */
import { chromium } from "playwright";
import { readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "screens");
mkdirSync(OUT, { recursive: true });

const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
const exe = readdirSync(root)
  .filter((x) => x.startsWith("chromium-")).sort().reverse()
  .map((d) => join(root, d, "chrome-linux", "chrome")).find(existsSync);
const BASE = process.env.BASE_URL || "http://localhost:4120";

const mk = (r, n, a, c, pk = "BKF INC", x = {}) => ({
  roomNumber: r, roomType: "DLXK", rtc: "", confirmationNumber: "9" + r,
  name: n, arrivalDate: "27/07/26", departureDate: "29/07/26", reservationStatus: "CKIN",
  adults: a, children: c, rateCode: "", packageCode: pk, ...x,
});

// A morning with the shapes that break layouts: a VIP, a COMP family, a
// no-package walk-in, a very long name, no-shows, and partial arrivals.
const CLIENTS = [
  mk("224", "POLANCO/ANGEL", 2, 1, "BKF INC", { isVip: true, vipLevel: "VIP" }),
  mk("310", "VANDENBERGHE-MONTGOMERY/ALEXANDRINE", 2, 2, "BKF INC"),
  mk("385", "DUPONT/MARIA", 2, 0),
  mk("402", "WEI/CHEN", 2, 2, "BKF COMP"),
  mk("418", "MARCHAND/SOFIA", 1, 0, ""),
  mk("437", "BENALI/OMAR", 2, 0, "BKF INC"),
  mk("455", "KOWALSKI/NINA", 1, 1, "BKF INC"),
  mk("501", "FABRE/JULIEN", 2, 0, "BKF INC", { isVip: true, vipLevel: "VIP" }),
  mk("517", "ROSSI/ELENA", 2, 0, "", { isVip: true, vipLevel: "X4", vipSource: "walk_in" }),
  mk("524", "SEDALO/TETE", 2, 2, ""),
  mk("533", "MOREAU/LUCAS", 1, 0, "BKF INC"),
  mk("608", "HADDAD/AMIRA", 2, 0),
  mk("619", "DAVID/JULIE", 1, 0),
  mk("640", "BONNET/HUGO", 2, 1, "BKF INC"),
  mk("655", "MOREL/SABINE", 1, 0, "BKF COMP"),
  mk("702", "ROUSSEAU/MARC", 2, 0, "BKF INC"),
  mk("718", "LEFÈVRE/CLAIRE", 2, 2, "BKF INC"),
  mk("733", "SEDALO/AMINA", 1, 0, ""),
  mk("801", "GARCIA/PABLO", 2, 0, "BKF INC"),
  mk("822", "LEFEVRE/PAUL", 1, 0),
  mk("840", "NGUYEN/LINH", 2, 1, "BKF INC"),
  mk("905", "SILVA/JOAO", 2, 0, "BKF INC"),
  mk("917", "ANDERSSON/EVA", 1, 0, "BKF INC"),
  mk("930", "KOVACS/ISTVAN", 2, 2, "BKF INC"),
];

// room, people, hour, minute — clustered into a real 07:40–08:40 rush.
const ARRIVALS = [
  ["402", 4, 6, 55], ["437", 2, 7, 10], ["917", 1, 7, 20],
  ["224", 3, 7, 40], ["385", 2, 7, 45], ["501", 2, 7, 50], ["640", 3, 7, 55],
  ["718", 2, 8, 0], ["905", 2, 8, 5], ["310", 4, 8, 10], ["655", 1, 8, 12],
  ["533", 1, 8, 15], ["702", 2, 8, 20], ["840", 2, 8, 25], ["455", 1, 8, 30],
  ["801", 2, 8, 35], ["517", 2, 8, 40], ["608", 1, 9, 5], ["930", 4, 9, 20],
  ["733", 1, 9, 50],
];

// Reception said one person in 310 and 930; four turned up in each.
const DISCREPANCIES = [
  ["310", "VANDENBERGHE-MONTGOMERY/ALEXANDRINE", 2, 0, 2, 2, 2],
  ["930", "KOVACS/ISTVAN", 2, 0, 2, 2, 2],
  ["718", "LEFÈVRE/CLAIRE", 3, 2, 2, 2, -1],
];

const seed = (clients, arrivals, discrepancies) => {
  const now = new Date();
  const d = now.toISOString().split("T")[0];
  const iso = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();
  const byRoom = Object.fromEntries(clients.map((c) => [c.roomNumber, c]));
  const checkIns = arrivals.map(([room, pax, h, m], i) => ({
    id: "ci" + i, roomNumber: room, clientName: byRoom[room].name,
    peopleEntered: pax, timestamp: iso(h, m),
  }));
  localStorage.setItem("dailyData_" + d, JSON.stringify({
    date: d, clients, checkIns, rawUploadText: "",
    discrepancies: discrepancies.map(([room, name, ba, bc, aa, ac, delta], i) => ({
      id: "dx" + i, roomNumber: room, clientName: name,
      beforeAdults: ba, beforeChildren: bc, afterAdults: aa, afterChildren: ac,
      delta, at: iso(8, 10 + i),
    })),
  }));
};

const SHOTS = [
  ["search-idle", "/search", async () => {}],
  ["search-typed", "/search", async (p) => {
    await p.locator('[data-role="search-field"] input').fill("224");
  }],
  ["search-name", "/search", async (p) => {
    await p.locator('[data-role="search-field"] input').fill("lefevre");
  }],
  ["search-filter", "/search", async (p) => {
    await p.getByText("RESTANTS").click().catch(() => {});
  }],
  ["checkin", "/checkin/224", async () => {}],
  ["notes-list", "/checkin/224", async (p) => {
    const tog = p.locator('[data-role="activity-toggle"]');
    if (await tog.isVisible().catch(() => false)) { await tog.click(); await p.waitForTimeout(260); }
    await p.locator('[data-role="side-tab-notes"]').click();
    await p.waitForTimeout(420);
  }],
  ["notes-compose", "/checkin/224", async (p) => {
    const tog = p.locator('[data-role="activity-toggle"]');
    if (await tog.isVisible().catch(() => false)) { await tog.click(); await p.waitForTimeout(260); }
    await p.locator('[data-role="side-tab-notes"]').click();
    await p.waitForTimeout(420);
    await p.locator('[data-role="note-new"]').click();
    await p.waitForTimeout(320);
    await p.locator('[data-role="note-title"]').fill("Allergie arachide");
    await p.locator('[data-role="note-body"]').fill("Prévenir la cuisine avant le service. Table éloignée du buffet si possible.");
  }],
  ["report", "/report", async (p) => { await p.waitForTimeout(700); }],
  ["report-grain-5", "/report", async (p) => {
    await p.locator('[data-role="affluence-grain"] button', { hasText: "5 min" }).first().click();
    await p.waitForTimeout(420);
  }],
  ["report-filter-ecart", "/report", async (p) => {
    await p.locator('[data-role="report-tile"][data-tile="ecart"]').click();
    await p.waitForTimeout(360);
  }],
  ["report-details", "/report/details", async (p) => { await p.waitForTimeout(500); }],
];

const b = await chromium.launch({
  headless: true, executablePath: exe,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const only = process.argv[2];
for (const dark of [true, false]) {
  for (const [name, path, act] of SHOTS) {
    if (only && !name.includes(only)) continue;
    const p = await b.newPage({
      viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2,
      colorScheme: dark ? "dark" : "light",
    });
    await p.goto(BASE + "/upload", { waitUntil: "load" });
    await p.evaluate(
      ([cl, ar, dx, isDark]) => {
        const now = new Date();
        const d = now.toISOString().split("T")[0];
        const iso = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();
        const byRoom = Object.fromEntries(cl.map((c) => [c.roomNumber, c]));
        localStorage.setItem("dailyData_" + d, JSON.stringify({
          date: d, clients: cl, rawUploadText: "",
          checkIns: ar.map(([room, pax, h, m], i) => ({
            id: "ci" + i, roomNumber: room, clientName: byRoom[room].name,
            peopleEntered: pax, timestamp: iso(h, m),
          })),
          discrepancies: dx.map(([room, nm, ba, bc, aa, ac, delta], i) => ({
            id: "dx" + i, roomNumber: room, clientName: nm,
            beforeAdults: ba, beforeChildren: bc, afterAdults: aa, afterChildren: ac,
            delta, at: iso(8, 10 + i),
          })),
        }));
        localStorage.setItem("app-dark", isDark ? "true" : "false");
      },
      [CLIENTS, ARRIVALS, DISCREPANCIES, dark]
    );
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    await p.waitForTimeout(650);
    try { await act(p); } catch (e) { console.log(`  ! ${name}: ${e.message.split("\n")[0]}`); }
    await p.waitForTimeout(420);

    const body = await p.evaluate(() => document.body.innerText.trim().length);
    if (body < 20) console.log(`  ! ${name} (${dark ? "dark" : "light"}) rendered almost nothing — check for a crash page`);

    const file = join(OUT, `${name}-${dark ? "dark" : "light"}.png`);
    await p.screenshot({ path: file });
    console.log(`  ${name} ${dark ? "dark" : "light"}`);
    await p.close();
  }
}
await b.close();
console.log("screens written to mockups/screens/");
