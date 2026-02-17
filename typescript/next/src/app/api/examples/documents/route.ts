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

        const documentsList = await client.documents.list(interaction.interactionId);

        const createdDocument = await client.documents.create(interaction.interactionId, {
            context: [
                {
                    type: 'facts',
                    data: [
                        { text: 'Patient has trouble breathing', source: 'core' },
                        { text: 'Patient is experiencing chest pain', source: 'user' },
                    ],
                },
            ],
            templateKey: 'corti-patient-summary',
            outputLanguage: 'en',
            name: 'Patient Consultation Note',
        });

        const retrievedDocument = await client.documents.get(
            interaction.interactionId,
            createdDocument.id!
        );

        const updatedDocument = await client.documents.update(
            interaction.interactionId,
            createdDocument.id!,
            {
                sections: [
                    {
                        key: 'chief-complaint',
                        text: 'Patient reports severe trouble breathing and chest pain',
                    },
                ],
            }
        );

        await client.documents.delete(interaction.interactionId, createdDocument.id!);

        await client.interactions.delete(interaction.interactionId);

        return NextResponse.json({
            documentsList,
            createdDocument,
            retrievedDocument,
            updatedDocument,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : error },
            { status: 500 }
        );
    }
}
