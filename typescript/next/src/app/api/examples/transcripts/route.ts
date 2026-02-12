import { NextResponse } from 'next/server';
import { CortiClient } from '@corti/sdk';
import { readFileSync } from 'node:fs';

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
        const buffer = readFileSync('public/trouble-breathing.mp3');
        const blob = new Blob([buffer], { type: 'audio/mpeg' });

        const recording = await client.recordings.upload(blob, interaction.interactionId);

        const list = await client.transcripts.list(interaction.interactionId);

        const createdTranscript = await client.transcripts.create(interaction.interactionId, {
            recordingId: recording.recordingId,
            primaryLanguage: 'en',
        });

        const getTranscript = await client.transcripts.get(interaction.interactionId, createdTranscript.id);

        await client.transcripts.delete(interaction.interactionId, createdTranscript.id);

        // clean up
        await client.recordings.delete(interaction.interactionId, recording.recordingId);
        await client.interactions.delete(interaction.interactionId);

        return NextResponse.json({
            list,
            createdTranscript,
            getTranscript,
        });
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
}
