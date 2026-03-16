import type { AuthCodeFormState, FormState, PkceFormState, RopcFormState } from "./types";

export const CONSOLE_URL = "https://console.corti.app";

export const WARNING_COPY =
  "We do not recommend calling our API directly from the frontend; in most cases we issue a general-purpose token that should not be stored on the frontend. You should implement your own authorization system and verify everything on your side before calling our API.";

export const initialForm: FormState = {
  clientId: "",
  clientSecret: "",
  environment: "",
  tenant: "",
};

export const initialRopcForm: RopcFormState = {
  clientId: "",
  environment: "",
  tenant: "",
  username: "",
  password: "",
};

export const initialAuthCodeForm: AuthCodeFormState = {
  clientId: "",
  clientSecret: "",
  environment: "",
  tenant: "",
  redirectUri: "",
};

export const initialPkceForm: PkceFormState = {
  clientId: "",
  environment: "",
  tenant: "",
  redirectUri: "",
};
