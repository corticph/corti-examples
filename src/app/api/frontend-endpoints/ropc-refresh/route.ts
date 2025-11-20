import { NextRequest, NextResponse } from 'next/server';
import { CortiAuth } from '@corti/sdk';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });

        const token = await auth.refreshToken({
            clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
            refreshToken: body.refresh_token || body.refreshToken || '',
        });

        return NextResponse.json(token);
    } catch (error) {
        return NextResponse.json({
            error: error,
        }, { status: 500 });
    }
}

