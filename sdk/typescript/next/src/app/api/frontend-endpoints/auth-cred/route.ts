import { NextResponse } from 'next/server';
import { CortiAuth } from '@corti/sdk';

export async function GET() {
    try {
        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });

        const token = await auth.getToken({
            clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
            clientSecret: process.env.CLIENT_SECRET!,
        });

        return NextResponse.json(token);
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
}
