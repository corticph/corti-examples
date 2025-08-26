'use client';

import { createContext, useState } from 'react';
import { CortiClient, CortiAuth } from '@corti/sdk';
import { useRouter, useSearchParams } from 'next/navigation';

type AuthContext = {
    handleCodeAuthRedirect: () => Promise<void>,
    getTokenFromCode: () => Promise<void>,
    getClientCredentialsToken: () => Promise<void>,
    cortiClient: CortiClient | null;
}

export const AuthContext = createContext<AuthContext>({
    handleCodeAuthRedirect: async () => {},
    getTokenFromCode: async () => {},
    getClientCredentialsToken: async () => {},
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
        const res = await fetch('/api/frontend-endpoints/auth-cred');
        const tokenData = await res.json();

        const client = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                ...tokenData,
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

    return (
        <AuthContext.Provider
            value={{
                handleCodeAuthRedirect,
                getTokenFromCode,
                getClientCredentialsToken,
                cortiClient
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
