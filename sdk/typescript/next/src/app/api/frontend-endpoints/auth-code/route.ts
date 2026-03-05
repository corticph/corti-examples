import { NextRequest, NextResponse } from 'next/server';
import { CortiAuth } from '@corti/sdk';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;

        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });

        const token = await auth.getCodeFlowToken({
            clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
            clientSecret: process.env.CLIENT_SECRET!,
            code: searchParams.get('code') || '',
            redirectUri: 'http://localhost:3000/callback',
        });

        return NextResponse.json(token);
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
}
