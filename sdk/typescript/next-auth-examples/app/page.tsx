"use client";

import { CortiAuth } from "@corti/sdk";
import type { SubmitEvent } from "react";
import { useCallback } from "react";
import { AuthCodeCredentialsForm } from "@/app/components/AuthCodeCredentialsForm";
import { AuthCodeReceivedView } from "@/app/components/AuthCodeReceivedView";
import { BackButton } from "@/app/components/BackButton";
import { ClientCredentialsForm } from "@/app/components/ClientCredentialsForm";
import { IntroView } from "@/app/components/IntroView";
import { PkceCredentialsForm } from "@/app/components/PkceCredentialsForm";
import { RopcCredentialsForm } from "@/app/components/RopcCredentialsForm";
import { SuccessView } from "@/app/components/SuccessView";
import { WarningBanner } from "@/app/components/WarningBanner";
import { getRequiredFormValues } from "@/app/lib/forms";
import { cacheFormValues } from "@/app/lib/sessionJson";
import { requestToken } from "@/app/lib/tokenRequest";
import { useAuthExampleState } from "@/app/lib/useAuthExampleState";
import { useInteractionsList } from "@/app/lib/useInteractionsList";

const AUTH_CODE_SESSION_KEY = "authcode_form";
const PKCE_SESSION_KEY = "pkce_form";

export default function Home() {
  const {
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
    tokenLoading,
    tokenError,
    setTokenError,
    token,
    tokenEnvTenant,
    tokenClient,
    handleBack,
    withTokenStates,
    setTokenResult,
  } = useAuthExampleState();

  const {
    list: interactionsList,
    loading: interactionsLoading,
    error: interactionsError,
  } = useInteractionsList(
    token?.accessToken ?? null,
    tokenEnvTenant?.environment ?? "",
    tokenEnvTenant?.tenant ?? "",
  );

  const handleSubmit = useCallback(
    async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();

      const required = getRequiredFormValues(e.currentTarget);

      if (!required.ok) {
        setTokenError("All fields are required.");
        return;
      }

      await withTokenStates(async () => {
        const result = await requestToken(
          "/api/auth/token",
          required.values,
          required.values.environment,
          required.values.tenant,
          "Failed to get token",
        );

        if (!result.ok) {
          throw new Error(result.error);
        }

        setTokenResult(result.data, result.environment, result.tenant, required.values.clientId);
      }, "Failed to get token");
    },
    [setTokenError, setTokenResult, withTokenStates],
  );

  const handleRopcSubmit = useCallback(
    async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      const required = getRequiredFormValues(e.currentTarget);

      if (!required.ok) {
        setTokenError("All fields are required.");
        return;
      }

      await withTokenStates(async () => {
        const result = await requestToken(
          "/api/auth/token/ropc",
          required.values,
          required.values.environment,
          required.values.tenant,
          "Failed to get token",
        );

        if (!result.ok) {
          throw new Error(result.error);
        }

        setTokenResult(result.data, result.environment, result.tenant, required.values.clientId);
      }, "Failed to get token");
    },
    [setTokenError, setTokenResult, withTokenStates],
  );

  const handleAuthCodeSubmit = useCallback(
    async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      const required = getRequiredFormValues(e.currentTarget);

      if (!required.ok) {
        setTokenError("All fields are required.");
        return;
      }

      setTokenError(null);
      cacheFormValues(AUTH_CODE_SESSION_KEY, required.values);

      const cortiAuth = new CortiAuth({
        tenantName: required.values.tenant,
        environment: required.values.environment,
      });

      await cortiAuth.authorizeURL({
        clientId: required.values.clientId,
        redirectUri: required.values.redirectUri,
      });
    },
    [setTokenError],
  );

  const handlePkceSubmit = useCallback(
    async (e: SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      const required = getRequiredFormValues(e.currentTarget);

      if (!required.ok) {
        setTokenError("All fields are required.");
        return;
      }

      setTokenError(null);
      cacheFormValues(PKCE_SESSION_KEY, required.values);

      const cortiAuth = new CortiAuth({
        tenantName: required.values.tenant,
        environment: required.values.environment,
      });

      await cortiAuth.authorizePkceUrl({
        clientId: required.values.clientId,
        redirectUri: required.values.redirectUri,
      });
    },
    [setTokenError],
  );

  const handlePkceProceed = useCallback(async () => {
    if (!pkceReceivedCode) {
      return;
    }

    await withTokenStates(async () => {
      const cortiAuth = new CortiAuth({
        tenantName: pkceForm.tenant,
        environment: pkceForm.environment,
      });

      const tokenResponse = await cortiAuth.getPkceFlowToken({
        clientId: pkceForm.clientId,
        code: pkceReceivedCode,
        redirectUri: pkceForm.redirectUri,
      });

      setTokenResult(tokenResponse, pkceForm.environment, pkceForm.tenant, pkceForm.clientId);
    }, "Failed to exchange PKCE authorization code");
  }, [pkceForm, pkceReceivedCode, setTokenResult, withTokenStates]);

  const handleAuthCodeProceed = useCallback(async () => {
    if (!receivedCode) {
      return;
    }
    await withTokenStates(async () => {
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

      if (!result.ok) {
        throw new Error(result.error);
      }

      setTokenResult(result.data, result.environment, result.tenant, authCodeForm.clientId);
      setReceivedCode(null);
    }, "Failed to exchange authorization code");
  }, [authCodeForm, receivedCode, setReceivedCode, setTokenResult, withTokenStates]);

  const handleRefreshToken = useCallback(() => {
    const canRefresh =
      token != null &&
      token.refreshToken != null &&
      tokenEnvTenant != null &&
      tokenClient != null &&
      !!tokenClient.clientId;

    if (!canRefresh) {
      return;
    }

    void withTokenStates(async () => {
      const refreshToken = token.refreshToken;
      if (!refreshToken) {
        return;
      }

      const cortiAuth = new CortiAuth({
        tenantName: tokenEnvTenant.tenant,
        environment: tokenEnvTenant.environment,
      });

      const tokenResponse = await cortiAuth.refreshToken({
        clientId: tokenClient.clientId,
        refreshToken,
      });

      setTokenResult(
        tokenResponse,
        tokenEnvTenant.environment,
        tokenEnvTenant.tenant,
        tokenClient.clientId,
      );
    }, "Failed to refresh token");
  }, [setTokenResult, token, tokenClient, tokenEnvTenant, withTokenStates]);

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
              onRefreshToken={handleRefreshToken}
              refreshTokenLoading={tokenLoading}
            />
          )}
        </div>
      </div>
    </main>
  );
}
