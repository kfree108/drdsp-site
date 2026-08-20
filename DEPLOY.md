# Dr. DSP — deployment and DNS cutover

The site is a single static page served by GitHub Pages from `main` / root of
`kfree108/drdsp-site`.

- **Live now:** https://kfree108.github.io/drdsp-site/
- **Target domain:** `drdsp.ai` (set as the Pages custom domain, in `CNAME`)
- **Status:** the domain still points at Squarespace. **DNS has not been changed.**

---

## What Ken has to do (needs your 2FA — nobody else can)

Log in to the registrar / DNS host for `drdsp.ai` and replace the Squarespace
records with these.

### A records on the apex (`@`)

| Type | Host | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

All four. GitHub load-balances across them; three out of four is a slow site.

### CNAME on `www`

| Type | Host | Value |
|------|------|-------|
| CNAME | `www` | `kfree108.github.io` |

Note the trailing dot some DNS panels add automatically — `kfree108.github.io.`
is the same thing and is fine. Do **not** put `drdsp.ai` or a URL in there.

### Delete

Any existing Squarespace A records, the Squarespace `www` CNAME, and any
`ALIAS`/`ANAME` record on the apex. Leave MX, TXT and any mail records alone —
removing those breaks email on the domain.

---

## Why the domain currently shows nothing useful

Squarespace's parking page for an unconfigured domain serves a `noindex` meta
tag. So until DNS moves, `drdsp.ai` is not merely showing the wrong page — it is
actively telling Google and every AI crawler not to index the domain at all. The
GitHub Pages URL above is fully indexable in the meantime, but the domain itself
stays invisible until the records change.

---

## The order of operations — this is the part that bit us

**Do not re-save the custom domain in GitHub Pages settings until DNS
propagation is confirmed across public resolvers.**

If you re-save the custom domain while the old Squarespace records are still
resolving, GitHub queues certificate issuance against that stale DNS, the
validation fails, and **GitHub gives up silently** — no error banner, no retry.
The site then sits on HTTPS "in progress" indefinitely and the only fix is to
remove the custom domain, wait, and add it back.

So, in order:

1. Change the DNS records above. Change nothing in GitHub.
2. Wait. Give it at least 30–60 minutes, and longer if the old records had a
   long TTL.
3. Confirm propagation across **public** resolvers — not just your own machine,
   whose cache is the least reliable thing in this process:

   ```sh
   dig +short drdsp.ai @8.8.8.8          # Google
   dig +short drdsp.ai @1.1.1.1          # Cloudflare
   dig +short drdsp.ai @9.9.9.9          # Quad9
   dig +short www.drdsp.ai @8.8.8.8      # should return kfree108.github.io
   ```

   All three must return the four `185.199.*.153` addresses and nothing else.
   If any resolver still returns a Squarespace IP, wait longer. A second opinion:
   https://dnschecker.org/#A/drdsp.ai

4. **Only then**, in GitHub → repo → Settings → Pages, clear the custom domain,
   re-enter `drdsp.ai`, and save. Or from the CLI:

   ```sh
   gh api -X PUT repos/kfree108/drdsp-site/pages -f cname="drdsp.ai"
   ```

5. Wait for "DNS check successful", then tick **Enforce HTTPS**. The certificate
   usually issues within a few minutes and can take up to an hour. If it is
   still pending after an hour, remove the custom domain, wait ten minutes, and
   add it back — that re-queues issuance cleanly.

6. Verify:

   ```sh
   curl -sI https://drdsp.ai/ | head -5          # expect 200
   curl -s https://drdsp.ai/robots.txt | head -3
   ```

---

## After the cutover

- Submit `https://drdsp.ai/sitemap.xml` in Google Search Console.
- Confirm GA4 property `G-FK1FG3TXLJ` is receiving events from the new hostname.
- Re-check that the Squarespace `noindex` is gone: `curl -s https://drdsp.ai/ | grep -i noindex`
  should return only the page's own `index, follow` robots meta.

## Files in this repo

| File | Purpose |
|------|---------|
| `index.html` | The whole site — one page, inline CSS |
| `assets/drdsp.mp4`, `assets/drdsp-poster.jpg` | Hero character video |
| `assets/engagement.js`, `assets/engagement.css` | CTA placement, 30% scroll popup, GA4 events |
| `robots.txt` | Allow-all incl. GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended |
| `sitemap.xml` | Single URL |
| `CNAME` | `drdsp.ai` — do not delete, Pages rewrites it on save |
| `.nojekyll` | Stops Pages running the content through Jekyll |
