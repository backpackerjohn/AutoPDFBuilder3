# Replit Agent — Work Order: AutoPDFBuilder (enable extraction + template fills + reliable downloads)

You are updating an existing Replit project named **AutoPDFBuilder**. Make the following changes **exactly** and report back with a concise diff summary and a green/red checklist of the acceptance criteria at the end.

---

## 0) Project context

- The repo has a single root `package.json` at `AutoPDFBuilder/package.json`.
- Client file to edit: `client/src/pages/home.tsx`
- Server files to edit:
  - `server/services/pdfProcessor.ts`
  - `server/index.ts`
  - `server/routes.ts`

---

## 1) Configure required Secrets and Object Storage

### 1.1 — Add Secrets (Environment Variables)

Create (or update) these secrets in Replit:

```
GEMINI_API_KEY=<PASTE VALID GOOGLE AI STUDIO API KEY>
PUBLIC_OBJECT_SEARCH_PATHS=/deal-bucket/public
PRIVATE_OBJECT_DIR=/deal-bucket/private/tmp
```

### 1.2 — Prepare Object Storage paths

In **Tools → Object Storage**:

- Ensure a bucket path exists for `/deal-bucket/public/templates/`
- Ensure a bucket path exists for `/deal-bucket/private/tmp/`
- Upload your **fillable** PDF templates into:\
  `/deal-bucket/public/templates/<templateName>.pdf`\
  (e.g., `retail-installment-contract.pdf` → template id `retail-installment-contract`)

**Verify:** Call `GET /api/templates` (via the app UI or HTTP) and confirm it returns your template names.

If templates do **not** appear:

- Re-check `PUBLIC_OBJECT_SEARCH_PATHS`
- Re-check that files are under `…/public/templates/` and have `.pdf` extension

---

## 2) Fix first-upload “No active deal” race + clearer upload errors

**Edit:** `client/src/pages/home.tsx`

### 2.1 — Replace `handleFileUpload` with this implementation:

```tsx
const handleFileUpload = async (file: File, documentType: string) => {
  // Ensure we have an active deal; use returned id immediately to avoid state race
  let dealId = currentJobId;
  if (!dealId) {
    const job = await createDealMutation.mutateAsync(form.getValues());
    dealId = job.id;
    setCurrentJobId(dealId);
  }

  // Optimistic UI
  setUploadedFiles(prev => ({ ...prev, [documentType]: file }));

  // Pass the id explicitly to avoid using stale state
  uploadFileMutation.mutate({ file, documentType, dealId });
};
```

### 2.2 — Update the upload mutation to accept `dealId` and surface server errors:

```tsx
const uploadFileMutation = useMutation({
  mutationFn: async ({
    file,
    documentType,
    dealId,
  }: { file: File; documentType: string; dealId?: string }) => {
    const id = dealId ?? currentJobId;
    if (!id) throw new Error('No active deal');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);

    const response = await fetch(`/api/deals/${id}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let message = 'Failed to process document.';
      try {
        const j = await response.json();
        if (j?.error) message = j.error;
      } catch {}
      throw new Error(message);
    }
    return response.json();
  },
  onSuccess: (_result, { documentType }) => {
    toast({
      title: 'Document processed',
      description: `${documentType} uploaded and analyzed successfully.`,
    });
    queryClient.invalidateQueries({ queryKey: ['/api/deals', currentJobId] });
  },
  onError: (error: any, { documentType }) => {
    // Roll back optimistic UI if upload failed
    setUploadedFiles(prev => {
      const { [documentType]: _, ...rest } = prev;
      return rest;
    });
    toast({
      title: 'Upload failed',
      description: error?.message || 'Failed to process document. Please try again.',
      variant: 'destructive',
    });
  },
});
```

### 2.3 — Ensure downloads use the server URL (skip if already done):

```tsx
const handleDownloadDocument = async (document: GeneratedDocument) => {
  window.location.href = document.downloadUrl;
};
```

---

## 3) Ensure field mapping fills “License Number” correctly

**Edit:** `server/services/pdfProcessor.ts`

Find the field-name mapping object inside `mapFieldNameToDataKey(...)`.\
Change the key to **lowercase** to match normalization (very important):

```diff
- 'licenseNumber': 'licenseNumber',
+ 'licensenumber': 'licenseNumber',
```

> Rationale: field names are normalized to lowercase alphanumerics (e.g., “License Number” → `licensenumber`), so the mapping key must be lowercase.

---

## 4) Add env sanity warnings + clearer upload error when AI key is missing

### 4.1 — Edit: `server/index.ts`

Immediately after `app.use(express.urlencoded({ extended: false }));` insert:

```ts
// Sanity warnings for required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.warn('[WARN] GEMINI_API_KEY is not set; image/chat extraction will not work.');
}
if (!process.env.PUBLIC_OBJECT_SEARCH_PATHS) {
  console.warn('[WARN] PUBLIC_OBJECT_SEARCH_PATHS is not set; templates will not be found.');
}
if (!process.env.PRIVATE_OBJECT_DIR) {
  console.warn('[WARN] PRIVATE_OBJECT_DIR is not set; combined downloads may fail.');
}
```

### 4.2 — Edit: `server/routes.ts`

In the `catch` block of `POST /api/deals/:id/upload`, return a **503** if the AI key is missing; otherwise include a clear error:

```ts
catch (error) {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: "AI extraction disabled: missing GEMINI_API_KEY" });
  }
  console.error("Error processing upload:", error);
  return res.status(500).json({ error: (error as Error).message || "Failed to process document" });
}
```

---

## 5) Build & run, then perform a smoke test

### 5.1 — Restart the repl

(so new env vars take effect).

### 5.2 — Verify templates list

The app should show the templates loaded from `/api/templates`.

### 5.3 — Test extraction and autofill (strict steps):

1. Upload a **Driver’s License** image to the **Driver’s License** tile (not “Spot Registration”).\
   **Expect:** success toast; server stores `firstName`, `lastName`, `address`, `licenseNumber`, `licenseExpiration` with confidence scores.
2. Upload VIN & Odometer images to their **matching** tiles (New Car VIN/Odometer or Trade-in VIN/Odometer).
3. (Optional) Enter “Deal Information” free text; click **Generate**.
   - If the yellow **Review Required** screen appears, click **Approve & Generate PDFs** to proceed.
4. Click **Download** on an individual document and **Download All Documents**.
   - Open the PDFs and confirm the form fields are filled (not a generic fallback).

---

## 6) Troubleshooting logic (only if something fails)

- **Templates not filling:**\
  Check server logs for “template not found in storage, creating basic document”.\
  If present: fix `PUBLIC_OBJECT_SEARCH_PATHS` and confirm the file exists under `/…/public/templates/<id>.pdf` and that the selected template id matches the file name.

- **Extraction empty:**\
  Confirm `GEMINI_API_KEY` is set and valid. Ensure images were uploaded to the correct tile (DL vs VIN vs Odometer vs Insurance). “Spot Registration” is **upload-only** (no extraction).

- **“No active deal” reappears:**\
  Confirm the **exact** `handleFileUpload` patch is present and that `uploadFileMutation` accepts/passes `dealId`.

- **License number still blank:**\
  Confirm the mapping key is `licensenumber` (lowercase). If other fields don’t fill, log PDF field names once and extend the mapping.

---

## Acceptance criteria (agent must report pass/fail)

-

**Report back** with:

- A concise diff summary (files changed + lines)
- The acceptance checklist with ✅/❌
- If any checkbox is ❌, include the error message and the remediation you applied (or propose)

**Use these exact steps. Do not omit any edits.**

