import { NextResponse } from 'next/server';
import { CortiAuth, CortiClient } from '@corti/sdk';

export async function GET() {
    try {
        const credentialsClient = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
                clientSecret: process.env.CLIENT_SECRET!,
            },
        });

        const auth = new CortiAuth({
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
        });

        const token = await auth.getToken({
            clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
            clientSecret: process.env.CLIENT_SECRET!,
        });

        const bearerClient = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                ...token,
                refreshAccessToken: async () => {
                    return auth.getToken({
                        clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
                        clientSecret: process.env.CLIENT_SECRET!,
                    });
                }
            },
        });

        const credentialsList = await credentialsClient.interactions.list();
        const bearerList = await bearerClient.interactions.list();

        return NextResponse.json({
            clientCredentials: credentialsList.data.length,
            bearer: bearerList.data.length,
        });
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
}
