export type CortiAssistantAuthResponse = {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  mode: "stateful" | "stateless";
};

type ConfigResponse = {
  baseUrl: string;
};

export type CortiAssistantBootstrap =
  | {
      baseUrl: string;
      authData: CortiAssistantAuthResponse;
    }
  | {
      error: string;
    };

let assistantBootstrapPromise: Promise<CortiAssistantBootstrap> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export function getCortiAssistantBootstrap() {
  if (!assistantBootstrapPromise) {
    assistantBootstrapPromise = Promise.all([
      getJson<ConfigResponse>("/api/config"),
      getJson<CortiAssistantAuthResponse>("/api/auth"),
    ])
      .then(([config, authData]) => ({
        baseUrl: config.baseUrl,
        authData,
      }))
      .catch((error: unknown) => ({
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Corti assistant",
      }));
  }

  return assistantBootstrapPromise;
}
