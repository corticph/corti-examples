'use client';

import { createContext, useState } from 'react';
import { CortiClient, CortiAuth } from '@corti/sdk';
import { useRouter, useSearchParams } from 'next/navigation';

type AuthContext = {
    handleCodeAuthRedirect: () => Promise<void>,
    getTokenFromCode: () => Promise<void>,
    getClientCredentialsToken: () => Promise<void>,
    handlePkceAuthRedirect: () => Promise<void>,
    getTokenFromPkceCode: () => Promise<void>,
    getRopcToken: (username: string, password: string) => Promise<void>,
    cortiClient: CortiClient | null;
}

export const AuthContext = createContext<AuthContext>({
    handleCodeAuthRedirect: async () => {},
    getTokenFromCode: async () => {},
    getClientCredentialsToken: async () => {},
    handlePkceAuthRedirect: async () => {},
    getTokenFromPkceCode: async () => {},
    getRopcToken: async () => {},
    cortiClient: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [cortiClient, setCortiClient] = useState<CortiClient | null>(null);

    const params = useSearchParams();
    const router = useRouter();

    async function handleCodeAuthRedirect() {
        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });

        await auth.authorizeURL({
            clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
            redirectUri: 'http://localhost:3000/callback',
        });
    }

    async function getTokenFromCode() {
        const res = await fetch('/api/frontend-endpoints/auth-code?' + params.toString());
        const tokenData = await res.json();

        const client = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                ...tokenData,
                refreshAccessToken: async (refreshToken) => {
                    return fetch(`/api/frontend-endpoints/auth-code-refresh?refresh_token=${refreshToken}`)
                        .then(async res => {
                            return res.json();
                        });
                },
            },
        });

        setCortiClient(client);

        router.replace('/');
    }

    async function getClientCredentialsToken() {
        const client = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                refreshAccessToken: async () => { // no refresh token for client credentials, we just get a new one
                    return fetch('/api/frontend-endpoints/auth-cred')
                        .then(async res => {
                            return res.json();
                        });
                },
            },
        });

        setCortiClient(client);
    }

    async function handlePkceAuthRedirect() {
        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });

        await auth.authorizePkceUrl({
            clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
            redirectUri: 'http://localhost:3000/callback',
        });
    }

    async function getTokenFromPkceCode() {
        const code = params.get('code');
        if (!code) return;

        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });

        const codeVerifier = auth.getCodeVerifier();
        if (!codeVerifier) {
            console.error('No code verifier found');
            return;
        }

        const res = await fetch(`/api/frontend-endpoints/pkce?code=${code}&redirect_uri=http://localhost:3000/callback&code_verifier=${codeVerifier}`);
        const tokenData = await res.json();

        const client = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                ...tokenData,
                refreshAccessToken: async (refreshToken) => {
                    return fetch(`/api/frontend-endpoints/pkce-refresh?refresh_token=${refreshToken}`)
                        .then(async res => {
                            return res.json();
                        });
                },
            },
        });

        setCortiClient(client);

        router.replace('/');
    }

    async function getRopcToken(username: string, password: string) {
        const res = await fetch('/api/frontend-endpoints/ropc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const tokenData = await res.json();

        const client = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                ...tokenData,
                refreshAccessToken: async (refreshToken) => {
                    return fetch('/api/frontend-endpoints/ropc-refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refresh_token: refreshToken }),
                    })
                        .then(async res => {
                            return res.json();
                        });
                },
            },
        });

        setCortiClient(client);
    }

    return (
        <AuthContext.Provider
            value={{
                handleCodeAuthRedirect,
                getTokenFromCode,
                getClientCredentialsToken,
                handlePkceAuthRedirect,
                getTokenFromPkceCode,
                getRopcToken,
                cortiClient
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
