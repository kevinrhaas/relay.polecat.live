# Sync locations — providers, keys, and how to sign up

A **sync location** is somewhere Relay keeps a full snapshot of your workspace
(the same JSON as Settings → Export). Any peer with access to that location can
pull the latest and be up to date **even when no other peer is online**. Data
still merges by last-writer-wins, so it plays nicely with live P2P sync.

> Security note (read once): Relay is pure client-side HTML/JS. Any credentials
> you enter live in *your* browser's localStorage and are used to call the
> provider directly from the browser. Use **scoped, least-privilege** keys and a
> **dedicated bucket/folder** for Relay. For anything sensitive, prefer the
> Local Folder option (no keys) or a read-only "public" snapshot for sharing.

---

## 0. Local Folder — the zero-key option (recommended to start)
- **What:** the browser's File System Access API lets you pick a folder; Relay
  reads/writes `relay-workspace.json` there.
- **Keys:** none. **Cost:** free.
- **The trick:** pick a folder your **Dropbox / Google Drive / iCloud / OneDrive
  desktop app already syncs**. Your existing cloud client then syncs that file
  across your devices — you get cloud sync with *zero* API setup.
- **Caveats:** works in Chromium/Edge (and desktop Safari/Firefox are catching
  up); you re-grant folder access per browser (Relay remembers the handle and
  asks once per session).

---

## 1. S3-compatible object storage (best free/cheap cloud option)
Relay talks to any S3-compatible API from the browser using signed requests
(AWS SigV4, computed locally with Web Crypto — no SDK). Available now in
**Settings → Advanced → Sync locations → S3-compatible**. You need:
**endpoint**, **bucket**, **access key id**, **secret** (region defaults to
`auto`, which Cloudflare R2 accepts; set a real region for AWS S3/B2 if
needed). You must enable **CORS** on the bucket (allow your Relay origin,
methods GET/PUT/HEAD).

| Provider | Free tier | Sign up → get keys | Notes |
|---|---|---|---|
| **Cloudflare R2** | 10 GB storage, generous ops; **no egress fees** | dash.cloudflare.com → R2 → Create bucket → *Manage R2 API Tokens* → create token (Object Read & Write, scoped to the bucket) | Endpoint: `https://<accountid>.r2.cloudflarestorage.com`. Best value; pairs with the rendezvous Worker you already have. |
| **Backblaze B2** | 10 GB storage, 1 GB/day download free | backblaze.com → B2 → Create bucket → *App Keys* → Add a Key (restrict to the bucket) | S3 endpoint shown on the bucket, e.g. `https://s3.us-west-004.backblazeb2.com`. |
| **AWS S3** | 5 GB for 12 months, then paid | console.aws.amazon.com/s3 → create bucket → IAM → create user with a bucket-scoped policy → access key | Watch egress costs; use a tight IAM policy. |

**CORS example** (adjust origin):
```json
[{"AllowedOrigins":["https://relay.polecat.live"],
  "AllowedMethods":["GET","PUT","HEAD"],
  "AllowedHeaders":["*"],"ExposeHeaders":["ETag"]}]
```

---

## 2. WebDAV (self-hosted / Nextcloud)
Available now in **Settings → Advanced → Sync locations → WebDAV**. Relay
authenticates with HTTP Basic auth straight from the browser — no SDK. You
need: **server URL** (the folder you want the snapshot in), **username**,
**password** (use an app password, not your main account password).
- **Providers:** Nextcloud (free self-host or low-cost managed), any WebDAV host.
- **Nextcloud URL shape:** `https://<host>/remote.php/dav/files/<user>/<folder>`
  — create `<folder>` first (Relay writes the file, not the folder).
- **Cost:** free if self-hosted. **Caveat:** the server must send CORS headers
  for your Relay origin (Nextcloud: Settings → Security → allow your origin,
  or set `CORS_ALLOWED_ORIGINS` for a reverse proxy in front of it).

---

## 3. Dropbox (OAuth — click-to-authorize, available now)
Available now in **Settings → Advanced → Sync locations → Dropbox**. Relay uses
OAuth 2.0 with PKCE, so there's no client secret to protect — only an **app key**
(client id) is ever entered, and it's not sensitive. Setup:
1. **dropbox.com/developers/apps** → Create app → **Scoped access** → **App folder**
   (recommended — Relay only ever sees its own folder, not your whole Dropbox).
2. Under **Permissions**, enable `files.content.write` and `files.content.read`,
   then click Submit.
3. Under **Settings**, copy the **App key**.
4. Under **OAuth 2 → Redirect URIs**, add the exact URL you see in the address
   bar when you're on Relay's Settings page (no `?query` or `#hash`) — e.g.
   `https://relay.polecat.live/app/`. This must match exactly or Dropbox will
   refuse the redirect.
5. Paste the app key into Settings → Advanced → Sync locations → Dropbox →
   **Connect Dropbox**. You'll be sent to Dropbox to approve access, then
   bounced straight back, connected.
- **Cost:** free. **Caveat:** self-hosting Relay at a different URL (or moving
  it) means re-registering the new redirect URI in the Dropbox app.

---

## 4. Google Drive (OAuth — planned)
Not implemented yet (see ROADMAP.md). Will follow the same shape as Dropbox
above: console.cloud.google.com → enable Drive API → OAuth consent screen →
**OAuth Client ID (Web)** → `drive.file` scope (limits access to files Relay
itself creates, so no broad Drive permission or Google app-verification review
needed).

---

## Which should I pick?
- **Just me, easiest:** Local Folder pointed at your existing Dropbox/Drive folder.
- **Small trusted group, cheap & fast:** Cloudflare R2 or Backblaze B2.
- **Already self-host:** WebDAV / Nextcloud.
- **Want click-to-authorize convenience:** Dropbox.

All of these store only the snapshot JSON; Relay merges it with your local data,
so turning a sync location on or off never loses anything.
