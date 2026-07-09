import { randomUUID } from "node:crypto";
import { Router } from "express";
import { INGEST_URL } from "../config.js";
import { requireCorti } from "../corti.js";
import { PATIENTS } from "../directory.js";
import { getClinician } from "../session.js";

const router = Router();

// Upload a document into the MCP index, scoped to a patient or "shared".
router.post("/documents", requireCorti, async (req, res) => {
  const clinician = getClinician();
  if (!clinician) {
    res.status(400).json({ error: "Sign in as a clinician first." });
    return;
  }
  const { scope, text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "Document text is required." });
    return;
  }

  // Authorize the chosen scope against the clinician's panel; never trust the
  // browser's scope. For patient docs, prepend an identifier header so the
  // name/MRN stay searchable.
  let resolvedScope: string;
  let docText = text;
  if (scope === "shared") {
    resolvedScope = "shared";
  } else if (typeof scope === "string" && scope.startsWith("patient:")) {
    const mrn = scope.slice("patient:".length);
    if (!clinician.patients.includes(mrn)) {
      res.status(403).json({ error: "You do not have access to that patient." });
      return;
    }
    resolvedScope = `patient:${mrn}`;
    const name = PATIENTS[mrn] ?? mrn;
    docText = `Patient: ${name} (${mrn})\n\n${text}`;
  } else {
    res.status(400).json({ error: "Invalid scope." });
    return;
  }

  // Auto-generate a unique title/source so uploads never silently overwrite.
  const source = `upload-${Date.now()}-${randomUUID().slice(0, 8)}`;

  try {
    const ingestResponse = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, text: docText, scope: resolvedScope }),
    });
    const body = await ingestResponse.json().catch(() => ({}));
    if (!ingestResponse.ok) {
      res.status(502).json({ error: body.error || `MCP ingest failed: ${ingestResponse.status}` });
      return;
    }
    console.log(
      `[upload] clinician=${clinician.id} scope=${resolvedScope} source=${source} chunks=${body.chunks}`,
    );
    res.json({ ok: true, source, scope: resolvedScope, chunks: body.chunks });
  } catch (err) {
    res.status(502).json({
      error: `Could not reach the MCP ingest endpoint: ${(err as Error).message}`,
    });
  }
});

export default router;
