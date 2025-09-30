import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';
import fs from 'fs';

export async function GET() {
    try {
        const {
            NEXT_PUBLIC_CLIENT_ID: CLIENT_ID,
            CLIENT_SECRET,
            NEXT_PUBLIC_TENANT_NAME: TENANT
        } = process.env;

        const client = new CortiClient({
            environment: CortiEnvironment.Eu,
            auth: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
            tenantName: TENANT,
        });

        const { interactionId } = await client.interactions.create({
            encounter: {
                identifier: 'GUID OF YOUR CHOOSING',
                status: 'planned',
                type: 'first_consultation',
            },
        });

        const { recordingId } = await client.recordings.upload(
            fs.createReadStream('public/trouble-breathing.mp3', { autoClose: true }),
            interactionId
        );

        const transcript = await client.transcripts.create(interactionId, {
            recordingId,
            primaryLanguage: 'en',
        });

        const document = await client.documents.create(interactionId, {
            context: [{
                type: 'string',
                data: transcript.transcripts.reduce((context, { text }) => context + ' ' + text, '')
            }],
            templateKey: 'soap',
            outputLanguage: 'en',
        });

        return NextResponse.json({
            data: document
        });
    } catch (error) {
        console.log(error);
        return NextResponse.json({
            error: error,
        });
    }
}
