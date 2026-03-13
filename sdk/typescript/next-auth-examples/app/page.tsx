"use client";

import { useCallback, useEffect, useState } from "react";
import { CortiAuth } from "@corti/sdk";
import type { AuthCodeFormState, FormState, PkceFormState, RopcFormState, TokenResponse } from "@/app/lib/types";
import { initialAuthCodeForm, initialForm, initialPkceForm, initialRopcForm } from "@/app/lib/constants";
import { useInteractionsList } from "@/app/lib/useInteractionsList";
import { WarningBanner } from "@/app/components/WarningBanner";
import { BackButton } from "@/app/components/BackButton";
import { IntroView } from "@/app/components/IntroView";
import { ClientCredentialsForm } from "@/app/components/ClientCredentialsForm";
import { RopcCredentialsForm } from "@/app/components/RopcCredentialsForm";
import { AuthCodeCredentialsForm } from "@/app/components/AuthCodeCredentialsForm";
import { PkceCredentialsForm } from "@/app/components/PkceCredentialsForm";
import { AuthCodeReceivedView } from "@/app/components/AuthCodeReceivedView";
import { SuccessView } from "@/app/components/SuccessView";

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

  const { list: interactionsList, loading: interactionsLoading, error: interactionsError } =
    useInteractionsList(
      token?.accessToken ?? null,
      tokenEnvTenant?.environment ?? "",
      tokenEnvTenant?.tenant ?? ""
    );

  // On mount: detect auth code or PKCE redirect (code in URL params) — disambiguate via sessionStorage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    // Clean up the URL so the code param is removed
    window.history.replaceState({}, "", window.location.pathname);

    // Check for PKCE form first (PKCE has no clientSecret)
    const pkceRaw = sessionStorage.getItem(PKCE_SESSION_KEY);
    if (pkceRaw) {
      let saved: PkceFormState;
      try {
        saved = JSON.parse(pkceRaw) as PkceFormState;
      } catch {
        return;
      }
      sessionStorage.removeItem(PKCE_SESSION_KEY);
      setFlow("pkce");
      setPkceForm(saved);
      setPkceReceivedCode(code);
      return;
    }

    // Fallback: auth code flow
    const authCodeRaw = sessionStorage.getItem(AUTH_CODE_SESSION_KEY);
    if (!authCodeRaw) return;

    let saved: AuthCodeFormState;
    try {
      saved = JSON.parse(authCodeRaw) as AuthCodeFormState;
    } catch {
      return;
    }

    sessionStorage.removeItem(AUTH_CODE_SESSION_KEY);
    setFlow("authCode");
    setAuthCodeForm(saved);
    setReceivedCode(code);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
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
      try {
        const res = await fetch("/api/auth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, clientSecret, environment, tenant }),
        });
        const data = await res.json();
        if (!res.ok) {
          setTokenError(data?.error ?? `Request failed (${res.status})`);
          return;
        }
        setToken(data as TokenResponse);
        setTokenEnvTenant({ environment, tenant });
      } catch (e) {
        setTokenError(e instanceof Error ? e.message : "Failed to get token");
      } finally {
        setTokenLoading(false);
      }
    },
    [form]
  );

  const handleRopcSubmit = useCallback(
    async (e: React.FormEvent) => {
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
      try {
        const res = await fetch("/api/auth/token/ropc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, environment, tenant, username, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setTokenError(data?.error ?? `Request failed (${res.status})`);
          return;
        }
        setToken(data as TokenResponse);
        setTokenEnvTenant({ environment, tenant });
      } catch (e) {
        setTokenError(e instanceof Error ? e.message : "Failed to get token");
      } finally {
        setTokenLoading(false);
      }
    },
    [ropcForm]
  );

  const handleAuthCodeSubmit = useCallback(
    async (e: React.FormEvent) => {
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

      // Persist form state before the redirect so we can exchange the code on return.
      sessionStorage.setItem(
        AUTH_CODE_SESSION_KEY,
        JSON.stringify({ clientId, clientSecret, environment, tenant, redirectUri })
      );

      // authorizeUrl sets window.location.href automatically when called in the browser.
      const cortiAuth = new CortiAuth({ tenantName: tenant, environment });
      await cortiAuth.authorizeUrl({ clientId, redirectUri });
    },
    [authCodeForm]
  );

  const handlePkceSubmit = useCallback(
    async (e: React.FormEvent) => {
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

      // Persist form state before the redirect so we can exchange the code on return.
      sessionStorage.setItem(
        PKCE_SESSION_KEY,
        JSON.stringify({ clientId, environment, tenant, redirectUri })
      );

      // authorizePkceUrl generates a code verifier, saves it to localStorage, computes the challenge,
      // builds the URL, and redirects the browser automatically.
      const cortiAuth = new CortiAuth({ tenantName: tenant, environment });
      await cortiAuth.authorizePkceUrl({ clientId, redirectUri });
    },
    [pkceForm]
  );

  const handlePkceProceed = useCallback(async () => {
    if (!pkceReceivedCode) return;
    setTokenError(null);
    setTokenLoading(true);
    try {
      const codeVerifier = CortiAuth.getCodeVerifier();
      const res = await fetch("/api/auth/token/pkce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: pkceForm.clientId,
          environment: pkceForm.environment,
          tenant: pkceForm.tenant,
          code: pkceReceivedCode,
          redirectUri: pkceForm.redirectUri,
          codeVerifier,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTokenError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      setPkceReceivedCode(null);
      setToken(data as TokenResponse);
      setTokenEnvTenant({ environment: pkceForm.environment, tenant: pkceForm.tenant });
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : "Failed to exchange PKCE authorization code");
    } finally {
      setTokenLoading(false);
    }
  }, [pkceReceivedCode, pkceForm]);

  const handleAuthCodeProceed = useCallback(async () => {
    if (!receivedCode) return;
    setTokenError(null);
    setTokenLoading(true);
    try {
      const res = await fetch("/api/auth/token/authcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: authCodeForm.clientId,
          clientSecret: authCodeForm.clientSecret,
          environment: authCodeForm.environment,
          tenant: authCodeForm.tenant,
          code: receivedCode,
          redirectUri: authCodeForm.redirectUri,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTokenError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      setReceivedCode(null);
      setToken(data as TokenResponse);
      setTokenEnvTenant({ environment: authCodeForm.environment, tenant: authCodeForm.tenant });
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : "Failed to exchange authorization code");
    } finally {
      setTokenLoading(false);
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
          <h1 className="text-3xl font-bold mb-2">
            Corti SDK — Auth examples
          </h1>

          {!token ? (
            <>
              {flow === null ? (
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
              )}
            </>
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
