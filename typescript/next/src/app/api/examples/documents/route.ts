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

        const documentsList = await client.documents.list(interaction.interactionId);

        const createdDocument = await client.documents.create(interaction.interactionId, {
            context: [{
                type: 'facts',
                data: [{
                    text: 'Patient has trouble breathing',
                    source: 'core'
                }, {
                    text: 'Patient is experiencing chest pain',
                    source: 'user'
                }]
            }],
            templateKey: 'corti-patient-summary',
            outputLanguage: 'en',
            name: 'Patient Consultation Note'
        });

        const retrievedDocument = await client.documents.get(interaction.interactionId, createdDocument.id!);

        const updatedDocument = await client.documents.update(interaction.interactionId, createdDocument.id!, {
            sections: [{
                key: 'chief-complaint',
                text: 'Patient reports severe trouble breathing and chest pain'
            }]
        });

        await client.documents.delete(interaction.interactionId, createdDocument.id!);

        // Clean up
        await client.interactions.delete(interaction.interactionId);

        return NextResponse.json({
            documentsList,
            createdDocument,
            retrievedDocument,
            updatedDocument,
            message: 'Example of documents API operations'
        });
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
} 