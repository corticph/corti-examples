import { NextResponse } from 'next/server';
import { CortiAuth, CortiClient, CortiEnvironment } from '@corti/sdk';
import { cortiErrorResponse } from '../cortiErrorResponse';

export async function GET(request: Request) {
    try {
        const tenantName = process.env.NEXT_PUBLIC_TENANT_NAME;
        if (!tenantName) {
            return NextResponse.json(
                { error: 'Missing NEXT_PUBLIC_TENANT_NAME' },
                { status: 400 }
            );
        }
        const clientId = process.env.NEXT_PUBLIC_CLIENT_ID;
        if (!clientId) {
            return NextResponse.json(
                { error: 'Missing NEXT_PUBLIC_CLIENT_ID' },
                { status: 400 }
            );
        }
        const clientSecret = process.env.CLIENT_SECRET;
        if (!clientSecret) {
            return NextResponse.json(
                { error: 'Missing CLIENT_SECRET' },
                { status: 400 }
            );
        }

        const auth = { clientId, clientSecret };
        const url = new URL(request.url);
        const scopeParam = url.searchParams.get('scopes');
        const scopes = scopeParam ? scopeParam.split(/[\s,]+/).filter(Boolean) : undefined;

        const cortiAuth = new CortiAuth({
            environment: CortiEnvironment.Us,
            tenantName,
        });

        const token = await cortiAuth.getToken({
            ...auth,
            ...(scopes?.length ? { scopes } : {}),
        });

        const client = new CortiClient({
            tenantName,
            environment: CortiEnvironment.Us,
            auth,
        });

        const interactions = await client.interactions.list();

        return NextResponse.json({ token, interactions });
    } catch (error) {
        return cortiErrorResponse(error);
    }
}
