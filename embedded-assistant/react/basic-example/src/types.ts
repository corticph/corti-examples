// Backend config response
export interface ConfigResponse {
  baseUrl: string;
}

// Backend auth response type - matches AuthCredentials from @corti/embedded-web
export interface AuthResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  mode: "stateful" | "stateless";
  // Error fields for failed responses
  error?: string;
  message?: string;
}

export type StatusType = "loading" | "success" | "error";

export interface Status {
  message: string;
  type: StatusType;
}
