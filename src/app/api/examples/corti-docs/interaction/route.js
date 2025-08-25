import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';

export async function GET() {
    try {
        function startClient(){
            const client = new CortiClient({
                environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID === 'eu'
                    ? CortiEnvironment.Eu
                    : process.env.NEXT_PUBLIC_ENVIRONMENT_ID,
                auth: {
                    clientId: process.env.NEXT_PUBLIC_CLIENT_ID,
                    clientSecret: process.env.CLIENT_SECRET,
                },
                tenantName: process.env.NEXT_PUBLIC_TENANT_NAME,
            });

            return client;
        }

        async function startInteraction(client) {
            const intRes = await client.interactions.create({
                encounter: {
                    identifier: 'YOUR_IDENTIFIER 2',
                    status: 'planned',
                    type: 'first_consultation'
                }
            });

            return intRes;
        }

        async function workflow(){
            const clientPassed = startClient();
            const interactionResult = await startInteraction(clientPassed);

            return interactionResult;
        }

        return NextResponse.json({
            data: await workflow()
        });
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
}
