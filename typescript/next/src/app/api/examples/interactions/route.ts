import { NextResponse } from 'next/server';
import { CortiClient } from '@corti/sdk';

export async function GET() {
    try {
        const client = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
                clientSecret: process.env.CLIENT_SECRET!,
            },
        });

        const list = await client.interactions.list();
        const collectedData = [];

        for await (const item of list) {
            collectedData.push(item);
        }

        const createdInteraction = await client.interactions.create({
            encounter: {
                identifier: Date.now().toString(),
                status: 'planned',
                type: 'first_consultation',
            },
            patient: {
                identifier: Date.now().toString(),
                gender: 'unknown'
            }
        });

        const interactionGet = await client.interactions.get(createdInteraction.interactionId);

        const updatedInteraction = await client.interactions.update(createdInteraction.interactionId, {
            encounter: {
                status: 'in-progress'
            }
        });

        const interactionDelete = await client.interactions.delete(createdInteraction.interactionId);

        return NextResponse.json({
            list: collectedData.length,
            createdInteraction,
            updatedInteraction,
            interactionGet,
            interactionDelete,
            message: 'Example of CRUD operations for interactions'
        });
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
}
