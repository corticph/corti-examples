import "dotenv/config";

export interface Config {
  tenantName: string;
  clientId: string;
  clientSecret: string;
  environment: "eu" | "us";
}

const REQUIRED_VARS = ["CORTI_TENANT_NAME", "CORTI_CLIENT_ID", "CORTI_CLIENT_SECRET"] as const;

/**
 * Reads and validates the Corti credentials from the environment, failing fast with an
 * actionable message instead of letting a later API call fail with a vague auth error.
 */
export function loadConfig(): Config {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    console.error("✗ Missing required environment variable(s): " + missing.join(", "));
    console.error("");
    console.error("  1. Copy .env.example to .env:   cp .env.example .env");
    console.error("  2. Fill in the values from your Corti Console app (https://console.corti.app)");
    console.error("     -> Settings -> Apps -> your app's Tenant name, Client ID, and Client secret");
    process.exit(1);
  }

  const environment = (process.env.CORTI_ENVIRONMENT ?? "eu").toLowerCase();

  if (environment !== "eu" && environment !== "us") {
    console.error(`✗ CORTI_ENVIRONMENT must be "eu" or "us", got "${environment}"`);
    process.exit(1);
  }

  return {
    tenantName: process.env.CORTI_TENANT_NAME as string,
    clientId: process.env.CORTI_CLIENT_ID as string,
    clientSecret: process.env.CORTI_CLIENT_SECRET as string,
    environment,
  };
}
