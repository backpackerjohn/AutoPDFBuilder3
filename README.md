# AutoPDFBuilder Stabilization Patch

This patch adds a reusable download helper for more reliable downloads in the Replit preview,
refactors the client to use that helper, and adds a health endpoint to the server to verify
environment readiness.

## Files Included
- `client_src_lib_download.ts.NEW`: new helper file to copy into `client/src/lib/download.ts`.
- `patches/client_src_pages_home.tsx.patch`: apply this patch to modify imports and download logic in `client/src/pages/home.tsx`.
- `patches/server_routes.ts.patch`: apply this patch to add `/api/health` to `server/routes.ts`.

## Applying the Patch

From the project root in the Replit shell:

```bash
# Add the new helper
mkdir -p AutoPDFBuilder/client/src/lib
cp client_src_lib_download.ts.NEW AutoPDFBuilder/client/src/lib/download.ts

# Apply patches
patch -p1 < patches/client_src_pages_home.tsx.patch
patch -p1 < patches/server_routes.ts.patch
```

After applying, set the following secrets:
- `GEMINI_API_KEY`: your Gemini API key.
- `PUBLIC_OBJECT_SEARCH_PATHS`: e.g., `/deal-bucket/public`.
- `PRIVATE_OBJECT_DIR`: e.g., `/deal-bucket/private/tmp`.
- `USE_GEMINI_FORM_FILL=1` to enable AI-driven form filling.

Restart the Replit environment, then visit `/api/health` to confirm all flags are `true`. Test
image uploads, document generation, and downloads.
