import { NextRequest, NextResponse } from 'next/server';
import { CortiAuth } from '@corti/sdk';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;

        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });

        const token = await auth.getPkceFlowToken({
            clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
            code: searchParams.get('code') || '',
            redirectUri: searchParams.get('redirect_uri') || 'http://localhost:3000/callback',
            codeVerifier: searchParams.get('code_verifier') || '',
        });

        return NextResponse.json(token);
    } catch (error) {
        return NextResponse.json({
            error: error,
        }, { status: 500 });
    }
}

