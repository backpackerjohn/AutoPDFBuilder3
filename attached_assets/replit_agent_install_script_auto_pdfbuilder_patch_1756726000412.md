Okay unzip and install the attached patch.

**First thing we are doing is centralizing and hardening downloads**, because we need our project to reliably trigger file saves inside the Replit preview and standard browsers without breaking other flows.

**Then we add a small `/api/health` probe**, because we need a quick way to confirm required secrets and storage paths are set before we blame extraction or generation.

---

## Phase 0 — Ground rules
- Act step‑by‑step. After each phase, stop and report what happened (success/output or errors) before moving on.
- Work from the repository root (the folder that contains `AutoPDFBuilder/`).

---

## Phase 1 — Receive and unzip the patch bundle from chat
**You** (the Replit Agent) will handle the zip I attach in chat. I will not place it into the repo.

1. Wait up to 60s for the uploaded zip to appear in your working dir. Poll for it:
   ```bash
   for i in {1..12}; do PATCH_ZIP="$(ls -1t *.zip 2>/dev/null | head -n 1)"; [ -n "$PATCH_ZIP" ] && break; sleep 5; done; echo "$PATCH_ZIP"
   ```
2. If still empty, search one level down (some agents store uploads in a subfolder):
   ```bash
   [ -z "$PATCH_ZIP" ] && PATCH_ZIP="$(ls -1t */*.zip 2>/dev/null | head -n 1)"; echo "$PATCH_ZIP"
   ```
3. If found in a subfolder, copy it to the repo root:
   ```bash
   case "$PATCH_ZIP" in */* ) cp "$PATCH_ZIP" ./patch_upload.zip && PATCH_ZIP=patch_upload.zip ;; esac; ls -l "$PATCH_ZIP"
   ```
4. If no zip is found, STOP and ask me to re‑attach it. Otherwise unzip:
   ```bash
   unzip -o "$PATCH_ZIP"
   ls -1 patches || true
   ```

---

## Phase 2 — Add the download helper (anchor → blob → new‑tab)
Create the helper file that all downloads will use.
```bash
mkdir -p AutoPDFBuilder/client/src/lib
if [ -f client_src_lib_download.ts.NEW ]; then
  cp client_src_lib_download.ts.NEW AutoPDFBuilder/client/src/lib/download.ts
elif [ -f patches/client_src_lib_download.ts.NEW ]; then
  cp patches/client_src_lib_download.ts.NEW AutoPDFBuilder/client/src/lib/download.ts
else
  echo "Helper file not found in bundle"; exit 1
fi
ls -l AutoPDFBuilder/client/src/lib/download.ts
```
Report: `download.ts` now exists.

---

## Phase 3 — Apply code patches
1. Patch the client (replace the download handler in `home.tsx` to call the helper):
   ```bash
   [ -f patches/client_src_pages_home.tsx.patch ] && patch -p1 < patches/client_src_pages_home.tsx.patch || echo "client patch not present; skipping"
   ```
2. Add the server health endpoint:
   ```bash
   [ -f patches/server_routes.ts.patch ] && patch -p1 < patches/server_routes.ts.patch || echo "routes patch not present; skipping"
   [ -f patches/server_index.ts.patch ]  && patch -p1 < patches/server_index.ts.patch  || true
   ```
3. Verify edits landed:
   ```bash
   grep -n "downloadFile" AutoPDFBuilder/client/src/pages/home.tsx || echo "Missing downloadFile import"
   grep -n "/api/health"  AutoPDFBuilder/server/routes.ts 2>/dev/null || true
   grep -n "/api/health"  AutoPDFBuilder/server/index.ts  2>/dev/null || true
   ```
Report: show the grep lines; confirm success.

---

## Phase 4 — Install & type‑check
```bash
npm install
npx tsc --noEmit
```
Report: any errors or warnings.

---

## Phase 5 — Verify required secrets and paths
Check that the environment contains the keys/paths the app needs. If not present, pause and request I add them in Replit → Secrets.
```bash
for v in GEMINI_API_KEY PUBLIC_OBJECT_SEARCH_PATHS PRIVATE_OBJECT_DIR USE_GEMINI_FORM_FILL; do
  if [ -z "$(printenv "$v")" ]; then echo "MISSING: $v"; else echo "OK: $v"; fi; done
```
Expected values:
- `GEMINI_API_KEY` — Google AI Studio key.
- `PUBLIC_OBJECT_SEARCH_PATHS` — `/deal-bucket/public`
- `PRIVATE_OBJECT_DIR` — `/deal-bucket/private/tmp`
- `USE_GEMINI_FORM_FILL` — `1`

Report: which are OK vs MISSING.

---

## Phase 6 — Restart & health check
1. Restart the server (whatever command this project uses; typically Replit restarts on save/run). Wait until it’s listening.
2. Probe the health endpoint:
   ```bash
   curl -sS http://localhost:3000/api/health || true
   ```
Expected JSON contains:
```json
{"ok":{"geminiKey":true,"publicPaths":true,"privateDir":true}, ...}
```
If any flag is `false`, stop and report which, do not proceed.

---

## Phase 7 — Smoke test (UI, happy path)
1. Upload images to the correct tiles:
   - Driver’s License → expect extracted `firstName, lastName, address, licenseNumber, licenseExpiration`.
   - VIN & Odometer photos to matching tiles.
   - (Optional) Add free‑text Deal Information.
2. Click **Generate Documents**. If a review screen appears, click **Approve & Generate PDFs**.
3. In the **Generate & Download** step:
   - Click **Download** on **Complete Deal Package** — confirm the file saves.
   - Click **Download All Documents** — confirm the combined PDF saves.
   - Click **Download** again — confirm re‑download works.
   - If the preview blocks the save, allow popups and retry (our code will fallback to opening a new tab if needed).

Report: which downloads saved successfully; attach any console/network errors if not.

---

## Phase 8 — Acceptance checklist (mark ✅/❌)
- `/api/health` reports all required flags `true`.
- Single **Download** saves a file.
- **Download All Documents** saves the combined PDF.
- Re‑download works without 404/410.
- PDFs contain autofilled fields from images/chat (DL, VIN, Odometer, Insurance).

If any item is ❌, paste:
- The failing step
- Exact error (toast + console excerpt)
- `curl` output from `/api/health`
- The Network tab status/headers for `/api/download/<key>`

---

## Notes on impact (why this won’t break other features)
- The download helper is isolated and called from the existing handler; it doesn’t touch extraction, field mapping, or generation.
- `/api/health` is read‑only and has no side effects.
- Object storage and TTL behavior are unchanged.

Proceed phase‑by‑phase and report after each phase.

