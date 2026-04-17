"use client";

import { useCallback, useEffect, useState } from "react";
import {
  initialAuthCodeForm,
  initialForm,
  initialPkceForm,
  initialRopcForm,
} from "@/app/lib/constants";
import { consumeCachedFormValues } from "@/app/lib/sessionJson";
import type {
  AuthCodeFormState,
  FormState,
  PkceFormState,
  RopcFormState,
  TokenResponse,
} from "@/app/lib/types";

const AUTH_CODE_SESSION_KEY = "authcode_form";
const PKCE_SESSION_KEY = "pkce_form";

export type Flow = "cc" | "ropc" | "authCode" | "pkce" | null;

export function useAuthExampleState() {
  const [flow, setFlow] = useState<Flow>(null);

  const [form, setForm] = useState<FormState>(initialForm);
  const [ropcForm, setRopcForm] = useState<RopcFormState>(initialRopcForm);
  const [authCodeForm, setAuthCodeForm] = useState<AuthCodeFormState>(initialAuthCodeForm);
  const [pkceForm, setPkceForm] = useState<PkceFormState>(initialPkceForm);

  const [receivedCode, setReceivedCode] = useState<string | null>(null);
  const [pkceReceivedCode, setPkceReceivedCode] = useState<string | null>(null);

  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [token, setToken] = useState<TokenResponse | null>(null);
  const [tokenEnvTenant, setTokenEnvTenant] = useState<{
    environment: string;
    tenant: string;
  } | null>(null);
  const [tokenClient, setTokenClient] = useState<{ clientId: string } | null>(null);

  useEffect(() => {
    const defaultRedirectUri = window.location.origin;

    setAuthCodeForm((prev) => {
      if (prev.redirectUri) {
        return prev;
      }

      return { ...prev, redirectUri: defaultRedirectUri };
    });

    setPkceForm((prev) => {
      if (prev.redirectUri) {
        return prev;
      }

      return { ...prev, redirectUri: defaultRedirectUri };
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    window.history.replaceState({}, "", window.location.pathname);

    const pkceSaved = consumeCachedFormValues<PkceFormState>(PKCE_SESSION_KEY);
    if (pkceSaved) {
      setFlow("pkce");
      setPkceForm(pkceSaved);
      setPkceReceivedCode(code);
      return;
    }

    const authCodeSaved = consumeCachedFormValues<AuthCodeFormState>(AUTH_CODE_SESSION_KEY);
    if (!authCodeSaved) return;

    setFlow("authCode");
    setAuthCodeForm(authCodeSaved);
    setReceivedCode(code);
  }, []);

  const handleBack = useCallback(() => {
    setFlow(null);
    setToken(null);
    setTokenEnvTenant(null);
    setTokenClient(null);
    setTokenError(null);
    setReceivedCode(null);
    setPkceReceivedCode(null);
  }, []);

  const withTokenStates = useCallback(async (fn: () => Promise<void>, defaultError: string) => {
    setTokenError(null);
    setTokenLoading(true);

    try {
      await fn();
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : defaultError);
    } finally {
      setTokenLoading(false);
    }
  }, []);

  const setTokenResult = useCallback(
    (tokenResponse: TokenResponse, environment: string, tenant: string, clientId?: string) => {
      setToken(tokenResponse);
      setTokenEnvTenant({ environment, tenant });

      if (clientId) {
        setTokenClient({ clientId });
      } else {
        setTokenClient(null);
      }
    },
    [],
  );

  return {
    flow,
    setFlow,

    form,
    setForm,
    ropcForm,
    setRopcForm,
    authCodeForm,
    setAuthCodeForm,
    pkceForm,
    setPkceForm,

    receivedCode,
    setReceivedCode,
    pkceReceivedCode,
    setPkceReceivedCode,

    tokenLoading,
    setTokenLoading,
    tokenError,
    setTokenError,
    token,
    setToken,
    tokenEnvTenant,
    setTokenEnvTenant,
    tokenClient,

    handleBack,
    withTokenStates,
    setTokenResult,
  };
}
