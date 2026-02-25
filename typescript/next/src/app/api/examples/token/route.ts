import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';
import { cortiErrorResponse } from '../cortiErrorResponse';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const clientId = url.searchParams.get('clientId');
        if (!clientId) {
            return NextResponse.json(
                { error: 'Missing required query parameter: clientId' },
                { status: 400 }
            );
        }
        const tenantName = process.env.NEXT_PUBLIC_TENANT_NAME;
        if (!tenantName) {
            return NextResponse.json(
                { error: 'Missing NEXT_PUBLIC_TENANT_NAME' },
                { status: 400 }
            );
        }

        const scopeParam = url.searchParams.get('scope');
        const scope = scopeParam ? scopeParam.split(/[\s,]+/).filter(Boolean).join(' ') : 'openid';
        const code = url.searchParams.get('code');
        const redirectUri = url.searchParams.get('redirectUri');
        const codeVerifier = url.searchParams.get('codeVerifier');
        const clientSecret = url.searchParams.get('clientSecret');
        const username = url.searchParams.get('username');
        const password = url.searchParams.get('password');
        const refreshToken = url.searchParams.get('refreshToken');

        const isPkce = code != null && code !== '' && redirectUri != null && redirectUri !== '' && codeVerifier != null && codeVerifier !== '';
        const isAuthorizationCode = !isPkce && code != null && code !== '' && redirectUri != null && redirectUri !== '';
        const isRopc = username != null && username !== '' && password != null && password !== '';
        const isRefresh = refreshToken != null && refreshToken !== '';

        if (isPkce) {
            // PKCE: no client secret required
        } else if (isAuthorizationCode) {
            if (!clientSecret) {
                return NextResponse.json(
                    { error: 'Missing required query parameter: clientSecret for authorization_code flow' },
                    { status: 400 }
                );
            }
        } else if (isRopc) {
            // ROPC: no client secret required
        } else if (isRefresh) {
            // Refresh: clientSecret optional (e.g. for confidential clients)
        } else {
            if (!clientSecret) {
                return NextResponse.json(
                    { error: 'Missing required query parameter: clientSecret' },
                    { status: 400 }
                );
            }
        }

        const client = new CortiClient({
            tenantName,
            environment: CortiEnvironment.Us,
            token: '',
        });

        const tokenResponse = isPkce
            ? await client.auth.token(tenantName, {
                  clientId,
                  grantType: 'authorization_code',
                  redirectUri: redirectUri!,
                  code: code!,
                  codeVerifier: codeVerifier!,
                  scope: scope || undefined,
              })
            : isAuthorizationCode
              ? await client.auth.token(tenantName, {
                    clientId,
                    clientSecret: clientSecret!,
                    grantType: 'authorization_code',
                    redirectUri: redirectUri!,
                    code: code!,
                    scope: scope || undefined,
                })
              : isRopc
                ? await client.auth.token(tenantName, {
                      clientId,
                      grantType: 'password',
                      username: username!,
                      password: password!,
                      scope: scope || undefined,
                  })
                : isRefresh
                  ? await client.auth.token(tenantName, {
                        clientId,
                        grantType: 'refresh_token',
                        refreshToken: refreshToken!,
                        ...(clientSecret ? { clientSecret } : {}),
                        scope: scope || undefined,
                    })
                  : await client.auth.token(tenantName, {
                        clientId,
                        clientSecret: clientSecret!,
                        grantType: 'client_credentials',
                        scope,
                    });

        return NextResponse.json(tokenResponse);
    } catch (error) {
        return cortiErrorResponse(error);
    }
}
