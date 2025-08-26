import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';

export async function GET() {
    try {
        const client = new CortiClient({
            environment: CortiEnvironment.Eu,
            auth: {
                clientId: process.env.NEXT_PUBLIC_CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
            },
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME,
        });

        const { interactionId } = await client.interactions.create({
            encounter: {
                identifier: 'YOUR_IDENTIFIER',
                status: 'planned',
                type: 'first_consultation'
            }
        });

        return NextResponse.json({
            data: interactionId
        });
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
}
