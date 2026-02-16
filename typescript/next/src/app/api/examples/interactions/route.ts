import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';

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
            token,
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
