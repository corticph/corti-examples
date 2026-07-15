import { Router } from "express";
import { getScopedToken, type StreamScope } from "../corti-token";

const router = Router();

const VALID_STREAM_SCOPES = new Set<StreamScope>(["transcribe", "streams"]);

router.post("/stream-token", async (req, res) => {
  try {
    const requested: unknown = req.body?.scopes;
    const scopes = (Array.isArray(requested) ? requested : []).filter(
      (s): s is StreamScope => VALID_STREAM_SCOPES.has(s as StreamScope),
    );
    if (scopes.length === 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "scopes must include 'transcribe' and/or 'streams'",
      });
    }

    const { access_token, expires_in } = await getScopedToken(scopes);
    res.json({ access_token, expires_in });
  } catch (error: any) {
    console.error("Stream-token error:", error.message);
    res.status(error.response?.status ?? 500).json({
      error: error.response?.data?.error || "TOKEN_FAILED",
      message:
        error.response?.data?.error_description ||
        error.message ||
        "Failed to mint scoped token",
    });
  }
});

export default router;
