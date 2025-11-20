'use client';

import { useContext, useEffect } from 'react';
import { AuthContext } from '@/common/AuthContext';
import { CortiAuth } from '@corti/sdk';

export default function Page() {
    const { getTokenFromCode, getTokenFromPkceCode } = useContext(AuthContext);

    useEffect(() => {
        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });
        
        const codeVerifier = auth.getCodeVerifier();
        if (codeVerifier) {
            void getTokenFromPkceCode();
        } else {
            void getTokenFromCode();
        }
    }, []);

    return (
        <div>
            Callback page. Waiting for access token...
        </div>
    );
}