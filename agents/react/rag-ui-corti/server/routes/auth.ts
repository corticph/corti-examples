import { Router } from "express";
import { connect, sdkError, sdkStatus } from "../corti.js";

const router = Router();

// Connect to Corti with the configured client credentials.
router.post("/auth", async (_req, res) => {
  try {
    await connect();
    res.json({ ok: true });
  } catch (err) {
    res.status(sdkStatus(err)).json(sdkError(err));
  }
});

export default router;
