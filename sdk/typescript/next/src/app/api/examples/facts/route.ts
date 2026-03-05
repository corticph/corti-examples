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
            token,
        });

        const interaction = await client.interactions.create({
            encounter: {
                identifier: Date.now().toString(),
                status: 'planned',
                type: 'first_consultation',
            },
            patient: {
                identifier: Date.now().toString(),
                gender: 'unknown',
            },
        });

        const factsGroups = await client.facts.factGroupsList();

        const listResponse = await client.facts.list(interaction.interactionId);

        const createdFacts = await client.facts.create(interaction.interactionId, {
            facts: [
                { text: 'Patient has trouble breathing', group: 'history-of-present-illness' },
                { text: 'Patient is experiencing chest pain', group: 'allergies' },
            ],
        });

        const updatedFacts = await client.facts.update(interaction.interactionId, createdFacts.facts![0].id!, {
            text: 'Patient has severe trouble breathing',
            source: 'user',
        });

        const batchUpdate = await client.facts.batchUpdate(interaction.interactionId, {
            facts: [
                { factId: createdFacts.facts![0].id!, text: 'Patient has minor trouble breathing' },
                { factId: createdFacts.facts![1].id!, text: 'Patient is experiencing severe chest pain' },
            ],
        });

        const extractResponse = await client.facts.extract({
            context: [{ type: 'text', text: 'Patient reports headache and fever for two days. No known allergies.' }],
            outputLanguage: 'en',
        });

        await client.interactions.delete(interaction.interactionId);

        return NextResponse.json({
            factsGroups,
            listResponse,
            createdFacts,
            updatedFacts,
            batchUpdate,
            extractResponse,
        });
    } catch (error) {
        return cortiErrorResponse(error);
    }
}
