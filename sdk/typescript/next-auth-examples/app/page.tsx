"use client";

import { CortiAuth } from "@corti/sdk";
import type { SubmitEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { AuthCodeCredentialsForm } from "@/app/components/AuthCodeCredentialsForm";
import { AuthCodeReceivedView } from "@/app/components/AuthCodeReceivedView";
import { BackButton } from "@/app/components/BackButton";
import { ClientCredentialsForm } from "@/app/components/ClientCredentialsForm";
import { IntroView } from "@/app/components/IntroView";
import { PkceCredentialsForm } from "@/app/components/PkceCredentialsForm";
import { RopcCredentialsForm } from "@/app/components/RopcCredentialsForm";
import { SuccessView } from "@/app/components/SuccessView";
import { WarningBanner } from "@/app/components/WarningBanner";
import {
  initialAuthCodeForm,
  initialForm,
  initialPkceForm,
  initialRopcForm,
} from "@/app/lib/constants";
import { requestToken } from "@/app/lib/tokenRequest";
import type {
  AuthCodeFormState,
  FormState,
  PkceFormState,
  RopcFormState,
  TokenResponse,
} from "@/app/lib/types";
import { useInteractionsList } from "@/app/lib/useInteractionsList";

const AUTH_CODE_SESSION_KEY = "authcode_form";
const PKCE_SESSION_KEY = "pkce_form";

type Flow = "cc" | "ropc" | "authCode" | "pkce" | null;

export default function Home() {
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

  const {
    list: interactionsList,
    loading: interactionsLoading,
    error: interactionsError,
  } = useInteractionsList(
    token?.accessToken ?? null,
    tokenEnvTenant?.environment ?? "",
    tokenEnvTenant?.tenant ?? "",
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    window.history.replaceState({}, "", window.location.pathname);

    const pkceRaw = sessionStorage.getItem(PKCE_SESSION_KEY);
    if (pkceRaw) {
      try {
        const saved = JSON.parse(pkceRaw) as PkceFormState;
        sessionStorage.removeItem(PKCE_SESSION_KEY);
        setFlow("pkce");
        setPkceForm(saved);
        setPkceReceivedCode(code);
      } catch {
        // ignore invalid stored state
      }
      return;
    }

    const authCodeRaw = sessionStorage.getItem(AUTH_CODE_SESSION_KEY);
    if (!authCodeRaw) return;

    try {
      const saved = JSON.parse(authCodeRaw) as AuthCodeFormState;
      sessionStorage.removeItem(AUTH_CODE_SESSION_KEY);
      setFlow("authCode");
      setAuthCodeForm(saved);
      setReceivedCode(code);
    } catch {
      // ignore invalid stored state
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: SubmitEvent) => {
      e.preventDefault();
      const clientId = form.clientId.trim();
      const clientSecret = form.clientSecret.trim();
      const environment = form.environment.trim();
      const tenant = form.tenant.trim();
      if (!clientId || !clientSecret || !environment || !tenant) {
        setTokenError("All fields are required.");
        return;
      }
      setTokenError(null);
      setTokenLoading(true);
      const result = await requestToken(
        "/api/auth/token",
        { clientId, clientSecret, environment, tenant },
        environment,
        tenant,
        "Failed to get token",
      );
      setTokenLoading(false);
      if (result.ok) {
        setToken(result.data);
        setTokenEnvTenant({ environment: result.environment, tenant: result.tenant });
      } else {
        setTokenError(result.error);
      }
    },
    [form],
  );

  const handleRopcSubmit = useCallback(
    async (e: SubmitEvent) => {
      e.preventDefault();
      const clientId = ropcForm.clientId.trim();
      const environment = ropcForm.environment.trim();
      const tenant = ropcForm.tenant.trim();
      const username = ropcForm.username.trim();
      const password = ropcForm.password.trim();
      if (!clientId || !environment || !tenant || !username || !password) {
        setTokenError("All fields are required.");
        return;
      }
      setTokenError(null);
      setTokenLoading(true);
      const result = await requestToken(
        "/api/auth/token/ropc",
        { clientId, environment, tenant, username, password },
        environment,
        tenant,
        "Failed to get token",
      );
      setTokenLoading(false);
      if (result.ok) {
        setToken(result.data);
        setTokenEnvTenant({ environment: result.environment, tenant: result.tenant });
      } else {
        setTokenError(result.error);
      }
    },
    [ropcForm],
  );

  const handleAuthCodeSubmit = useCallback(
    async (e: SubmitEvent) => {
      e.preventDefault();
      const clientId = authCodeForm.clientId.trim();
      const clientSecret = authCodeForm.clientSecret.trim();
      const environment = authCodeForm.environment.trim();
      const tenant = authCodeForm.tenant.trim();
      const redirectUri = authCodeForm.redirectUri.trim();
      if (!clientId || !clientSecret || !environment || !tenant || !redirectUri) {
        setTokenError("All fields are required.");
        return;
      }
      setTokenError(null);
      sessionStorage.setItem(
        AUTH_CODE_SESSION_KEY,
        JSON.stringify({ clientId, clientSecret, environment, tenant, redirectUri }),
      );
      const cortiAuth = new CortiAuth({ tenantName: tenant, environment });
      await cortiAuth.authorizeURL({ clientId, redirectUri });
    },
    [authCodeForm],
  );

  const handlePkceSubmit = useCallback(
    async (e: SubmitEvent) => {
      e.preventDefault();
      const clientId = pkceForm.clientId.trim();
      const environment = pkceForm.environment.trim();
      const tenant = pkceForm.tenant.trim();
      const redirectUri = pkceForm.redirectUri.trim();
      if (!clientId || !environment || !tenant || !redirectUri) {
        setTokenError("All fields are required.");
        return;
      }
      setTokenError(null);
      sessionStorage.setItem(
        PKCE_SESSION_KEY,
        JSON.stringify({ clientId, environment, tenant, redirectUri }),
      );
      const cortiAuth = new CortiAuth({ tenantName: tenant, environment });
      await cortiAuth.authorizePkceUrl({ clientId, redirectUri });
    },
    [pkceForm],
  );

  const handlePkceProceed = useCallback(async () => {
    if (!pkceReceivedCode) {
      return;
    }
    setTokenError(null);
    setTokenLoading(true);
    const codeVerifier = CortiAuth.getCodeVerifier();
    const result = await requestToken(
      "/api/auth/token/pkce",
      {
        clientId: pkceForm.clientId,
        environment: pkceForm.environment,
        tenant: pkceForm.tenant,
        code: pkceReceivedCode,
        redirectUri: pkceForm.redirectUri,
        codeVerifier,
      },
      pkceForm.environment,
      pkceForm.tenant,
      "Failed to exchange PKCE authorization code",
    );
    setTokenLoading(false);
    if (result.ok) {
      setPkceReceivedCode(null);
      setToken(result.data);
      setTokenEnvTenant({ environment: result.environment, tenant: result.tenant });
    } else {
      setTokenError(result.error);
    }
  }, [pkceReceivedCode, pkceForm]);

  const handleAuthCodeProceed = useCallback(async () => {
    if (!receivedCode) {
      return;
    }
    setTokenError(null);
    setTokenLoading(true);
    const result = await requestToken(
      "/api/auth/token/authcode",
      {
        clientId: authCodeForm.clientId,
        clientSecret: authCodeForm.clientSecret,
        environment: authCodeForm.environment,
        tenant: authCodeForm.tenant,
        code: receivedCode,
        redirectUri: authCodeForm.redirectUri,
      },
      authCodeForm.environment,
      authCodeForm.tenant,
      "Failed to exchange authorization code",
    );
    setTokenLoading(false);
    if (result.ok) {
      setReceivedCode(null);
      setToken(result.data);
      setTokenEnvTenant({ environment: result.environment, tenant: result.tenant });
    } else {
      setTokenError(result.error);
    }
  }, [receivedCode, authCodeForm]);

  const handleBack = useCallback(() => {
    setFlow(null);
    setToken(null);
    setTokenEnvTenant(null);
    setTokenError(null);
    setReceivedCode(null);
    setPkceReceivedCode(null);
  }, []);

  const showBack = flow != null || token != null;

  return (
    <main className="min-h-screen flex flex-col items-center p-6 sm:p-8">
      <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-8">
        <WarningBanner />

        <div className="w-full flex flex-col items-center text-center">
          {showBack && (
            <div className="w-full flex justify-start mb-2">
              <BackButton onClick={handleBack} />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-2">Corti SDK — Auth examples</h1>

          {!token ? (
            flow === null ? (
              <IntroView
                onAuthenticateWithCC={() => setFlow("cc")}
                onAuthenticateWithROPC={() => setFlow("ropc")}
                onAuthenticateWithAuthCode={() => setFlow("authCode")}
                onAuthenticateWithPkce={() => setFlow("pkce")}
              />
            ) : flow === "cc" ? (
              <ClientCredentialsForm
                form={form}
                setForm={setForm}
                onSubmit={handleSubmit}
                tokenError={tokenError}
                tokenLoading={tokenLoading}
              />
            ) : flow === "ropc" ? (
              <RopcCredentialsForm
                form={ropcForm}
                setForm={setRopcForm}
                onSubmit={handleRopcSubmit}
                tokenError={tokenError}
                tokenLoading={tokenLoading}
              />
            ) : flow === "pkce" ? (
              pkceReceivedCode ? (
                <AuthCodeReceivedView
                  code={pkceReceivedCode}
                  onProceed={handlePkceProceed}
                  loading={tokenLoading}
                  error={tokenError}
                />
              ) : (
                <PkceCredentialsForm
                  form={pkceForm}
                  setForm={setPkceForm}
                  onSubmit={handlePkceSubmit}
                  tokenError={tokenError}
                  tokenLoading={tokenLoading}
                />
              )
            ) : receivedCode ? (
              <AuthCodeReceivedView
                code={receivedCode}
                onProceed={handleAuthCodeProceed}
                loading={tokenLoading}
                error={tokenError}
              />
            ) : (
              <AuthCodeCredentialsForm
                form={authCodeForm}
                setForm={setAuthCodeForm}
                onSubmit={handleAuthCodeSubmit}
                tokenError={tokenError}
                tokenLoading={tokenLoading}
              />
            )
          ) : (
            <SuccessView
              token={token}
              interactionsList={interactionsList}
              interactionsLoading={interactionsLoading}
              interactionsError={interactionsError}
            />
          )}
        </div>
      </div>
    </main>
  );
}
