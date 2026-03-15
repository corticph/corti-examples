import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "dotenv";
import { CortiAuth } from "@corti/sdk";

config();

const app = express();
const PORT = 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  }),
);

const auth = new CortiAuth({
  environment: process.env.CORTI_ENVIRONMENT!,
  tenantName: process.env.CORTI_TENANT_NAME!,
});

// Serve static files except for root
app.use(express.static("public"));

// Serve @corti/embedded-web from node_modules
app.use(
  "/lib/embedded-web",
  express.static("node_modules/@corti/embedded-web/dist"),
);

// Serve index.html at root and inject baseUrl

app.get("/", (req: Request, res: Response) => {
  const environment = process.env.CORTI_ENVIRONMENT!;
  const baseUrl = `https://assistant.${environment}.corti.app`;
  const indexPath = path.join(__dirname, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace("{{baseUrl}}", baseUrl);
  res.send(html);
});

app.get("/api/auth", async (req: Request, res: Response) => {
  try {
    const clientId = process.env.CORTI_CLIENT_ID!;
    const username = process.env.CORTI_USER_EMAIL!;
    const password = process.env.CORTI_USER_PASSWORD!;

    const tokenResponse = await auth.getRopcFlowToken({
      clientId,
      username,
      password,
    });

    res.json({
      access_token: tokenResponse.accessToken,
      refresh_token: tokenResponse.refreshToken,
      id_token: "",
      token_type: tokenResponse.tokenType || "Bearer",
      expires_in: tokenResponse.expiresIn,
      mode: "stateful",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to authenticate",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running at http://localhost:${PORT}`);
  console.log(`📡 API endpoint available at http://localhost:${PORT}/api/auth`);
});
