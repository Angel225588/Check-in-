/**
 * The demo data and the debug screen are for us, not for the desk.
 *
 * They exist so a morning can be rehearsed and a bug reproduced — and both are
 * dangerous in a real service: "Charger un service de démo" REPLACES today's
 * data, and at 07:40 that is the whole morning gone with one mis-tap.
 *
 * So they are behind a build flag rather than deleted. Deleting them would also
 * blind the harnesses that click through the app's own demo loader — the ones
 * that caught the seeder writing UTC timestamps — and a check that cannot run
 * is a check that does not exist.
 *
 * Production builds simply do not set the flag, so the code is unreachable and
 * the buttons are not rendered. `NEXT_PUBLIC_` is inlined at build time: the
 * decision is made once, by the build, not by the tablet.
 */
export function testToolsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TEST_TOOLS === "1";
}
