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

        const interaction = await client.interactions.create({
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

        const factsGroups = await client.facts.factGroupsList();

        const listResponse = await client.facts.list(interaction.interactionId);

        const createdFacts = await client.facts.create(interaction.interactionId, {
            facts: [{
                text: 'Patient has trouble breathing',
                group: 'history-of-present-illness'
            }, {
                text: 'Patient is experiencing chest pain',
                group: 'allergies'
            }]
        });

        const updatedFacts = await client.facts.update(interaction.interactionId, createdFacts.facts![0].id!,
            {
                text: 'Patient has severe trouble breathing',
                source: 'user'
            });


        const batchUpdate = await client.facts.batchUpdate(interaction.interactionId, {
            facts: [
                {
                    factId: createdFacts.facts![0].id!,
                    text: 'Patient has minor trouble breathing',
                },
                {
                    factId: createdFacts.facts![1].id!,
                    text: 'Patient is experiencing severe chest pain',
                }
            ]
        });

        // clean up
        await client.interactions.delete(interaction.interactionId);

        return NextResponse.json({
            factsGroups,
            listResponse,
            createdFacts,
            updatedFacts,
            batchUpdate
        });
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
} 