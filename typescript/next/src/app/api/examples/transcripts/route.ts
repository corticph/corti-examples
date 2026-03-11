import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';
import { cortiErrorResponse } from '../cortiErrorResponse';
import { readFileSync } from 'node:fs';

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
            auth: { accessToken: token },
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
        const buffer = readFileSync('public/trouble-breathing.mp3');
        const blob = new Blob([buffer], { type: 'audio/mpeg' });

        const recording = await client.recordings.upload(blob, interaction.interactionId);

        const list = await client.transcripts.list(interaction.interactionId);

        const createdTranscript = await client.transcripts.create(interaction.interactionId, {
            recordingId: recording.recordingId,
            primaryLanguage: 'en',
        });

        const transcriptStatus = await client.transcripts.getStatus(interaction.interactionId, createdTranscript.id);

        const getTranscript = await client.transcripts.get(interaction.interactionId, createdTranscript.id);

        await client.transcripts.delete(interaction.interactionId, createdTranscript.id);

        await client.recordings.delete(interaction.interactionId, recording.recordingId);
        await client.interactions.delete(interaction.interactionId);

        return NextResponse.json({
            list,
            createdTranscript,
            transcriptStatus,
            getTranscript,
        });
    } catch (error) {
        return cortiErrorResponse(error);
    }
}
