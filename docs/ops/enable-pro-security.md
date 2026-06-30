# Browser-agent prompt — enable Pro-tier security

Paste the block below into a browser agent (Claude in Chrome / computer-use) running on
Angel's **logged-in** browser. It enables the **free** Pro security features and only
*reports* PITR (paid). After it runs, Claude re-runs `get_advisors(security)` to confirm.

---

```
You are operating my logged-in browser. Enable ONLY the security settings listed below,
across two dashboards. Do not change anything else. After each change, confirm it saved.
At the end, give me a bullet list of exactly what you toggled.

=== VERCEL (free with Pro — enable all) ===
1. Go to https://vercel.com and open the project named "check-in".
2. Open the "Firewall" tab (top of the project).
3. Turn ON "Attack Challenge Mode" (DDoS protection).
4. Under "Managed Rulesets", enable the Vercel-managed OWASP / Core ruleset
   (set it to Active/Deny if offered; if unsure, set it to "Log" to start — tell me which).
5. If you see "Bot Protection" or "BotID", enable it.
6. Make sure the Firewall shows "Enabled". Save if there's a save button.

=== SUPABASE (free toggle) ===
7. Go to https://supabase.com/dashboard and open the project "imarketin"
   (ref: qimhmwkmkbqxsvtayldn, region eu-west-3 Paris).
8. Open Authentication. Find "Attack Protection" (or Password security under Policies/Sign-In)
   and enable "Leaked password protection" (checks HaveIBeenPwned). Save.
9. Open Database → Backups. Confirm "Daily backups" is ON (included with Pro).
   Do NOT change the retention or any other backup setting.

=== DO NOT ENABLE — just REPORT (paid) ===
10. Point-in-Time Recovery (PITR): go to Project Settings → Add-ons → Point-in-Time Recovery.
    This is a PAID add-on. DO NOT enable it. Just tell me: is it currently on or off, and
    what monthly price is shown?

When finished, report: (a) every toggle you changed, (b) the PITR on/off status + price.
Do not touch billing, env vars, domains, members, or any setting not listed above.
```

---

**After the agent reports back:** ping Claude → re-run `get_advisors(security)` on the
Supabase project. Expected: the "leaked password protection" WARN is gone; the 3 INFO
(`app_config` / `auth_attempts` / `location_codes`) remain — those are intentional
locked server-only tables. (WAF is Vercel-side and won't appear in Supabase advisors.)
