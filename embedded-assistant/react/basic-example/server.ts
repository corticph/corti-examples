import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "dotenv";
import { CortiAuth } from "@corti/sdk";

// Load environment variables
config();

const app = express();
const PORT = 3000;

// Enable CORS for Vite dev server
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  }),
);

// Initialize Corti Auth
const auth = new CortiAuth({
  environment: process.env.CORTI_ENVIRONMENT!,
  tenantName: process.env.CORTI_TENANT_NAME!,
});

/**
 * Authentication endpoint using ROPC (Resource Owner Password Credentials)
 *
 * Prerequisites:
 * 1. Create a user in the Corti Console (console.corti.app)
 * 2. Create an ROPC-enabled OAuth client with "Direct Access Grants" enabled
 * 3. Configure credentials in .env file
 */
app.get("/api/auth", async (req: Request, res: Response) => {
  try {
    const clientId = process.env.CORTI_CLIENT_ID!;
    const username = process.env.CORTI_USER_EMAIL!;
    const password = process.env.CORTI_USER_PASSWORD!;

    console.log(`Authenticating user: ${username}`);

    // Use Corti SDK's ROPC flow
    const tokenResponse = await auth.getRopcFlowToken({
      clientId,
      username,
      password,
    });

    console.log("Authentication successful");

    // Return the complete AuthCredentials object ready for api.auth()
    res.json({
      access_token: tokenResponse.accessToken,
      refresh_token: tokenResponse.refreshToken,
      id_token: "",
      token_type: tokenResponse.tokenType || "Bearer",
      expires_in: tokenResponse.expiresIn,
      mode: "stateful",
    });
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      error: "Failed to authenticate",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Config endpoint - provides baseUrl to client
app.get("/api/config", (req: Request, res: Response) => {
  const environment = process.env.CORTI_ENVIRONMENT!;
  const baseUrl = `https://assistant.${environment}.corti.app`;
  res.json({ baseUrl });
});

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running at http://localhost:${PORT}`);
  console.log(`📡 API endpoint available at http://localhost:${PORT}/api/auth`);
});
