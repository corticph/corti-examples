import { Router } from "express";
import { getScopedToken, type StreamScope } from "../corti-token";

const router = Router();

const VALID_STREAM_SCOPES = new Set<StreamScope>(["transcribe", "streams"]);

router.post("/stream-token", async (req, res) => {
  try {
    const requested: unknown = req.body?.scopes;
    const scopes = (Array.isArray(requested) ? requested : []).filter((s): s is StreamScope =>
      VALID_STREAM_SCOPES.has(s as StreamScope),
    );
    if (scopes.length === 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "scopes must include 'transcribe' and/or 'streams'",
      });
    }

    const { accessToken, expiresIn } = await getScopedToken(scopes);
    res.json({ accessToken, expiresIn });
  } catch (error: unknown) {
    const e = error as {
      message?: string;
      response?: { status?: number; data?: { error?: string; error_description?: string } };
    };
    console.error("Stream-token error:", e.message);
    res.status(e.response?.status ?? 500).json({
      error: e.response?.data?.error ?? "TOKEN_FAILED",
      message: e.response?.data?.error_description ?? e.message ?? "Failed to mint scoped token",
    });
  }
});

export default router;
