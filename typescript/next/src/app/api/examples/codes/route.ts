import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';
import { cortiErrorResponse } from '../cortiErrorResponse';

export async function GET(request: Request) {
    try {
        const token = new URL(request.url).searchParams.get('token');
        if (!token) {
            return NextResponse.json(
                { error: 'Missing required query parameter: token' },
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

        const client = new CortiClient({
            tenantName,
            environment: CortiEnvironment.Us,
            auth: { accessToken: token },
        });

        const predictResponse = await client.codes.predict({
            system: ['icd10cm', 'cpt'],
            context: [
                {
                    type: 'text',
                    text: 'Short arm splint applied in ED for pain control.',
                },
            ],
            maxCandidates: 5,
        });

        return NextResponse.json({
            predictResponse,
        });
    } catch (error) {
        return cortiErrorResponse(error);
    }
}
