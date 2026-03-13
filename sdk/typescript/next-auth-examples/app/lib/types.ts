export type TokenResponse = {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  tokenType?: string;
  [key: string]: unknown;
};

export type FormState = {
  clientId: string;
  clientSecret: string;
  environment: string;
  tenant: string;
};

export type RopcFormState = {
  clientId: string;
  environment: string;
  tenant: string;
  username: string;
  password: string;
};

export type AuthCodeFormState = {
  clientId: string;
  clientSecret: string;
  environment: string;
  tenant: string;
  redirectUri: string;
};

export type PkceFormState = {
  clientId: string;
  environment: string;
  tenant: string;
  redirectUri: string;
};
