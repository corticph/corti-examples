import { NextResponse } from 'next/server';
import { CortiClient } from '@corti/sdk';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'stream/promises';
import { ReadableStream } from 'node:stream/web';

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
                type: 'first_consultation'
            }
        });

        const recordsList = await client.recordings.list(interaction.interactionId);

        const file = createReadStream('public/trouble-breathing.mp3', {
            autoClose: true
        });

        const res = await client.recordings.upload(file, interaction.interactionId);

        const getResponse = await client.recordings.get(interaction.interactionId, res.recordingId);
        const webStream = getResponse.stream() as ReadableStream<Uint8Array>;
        const nodeReadable = Readable.from(webStream);
        const writeStream = createWriteStream(`public/${res.recordingId}.mp3`);

        nodeReadable.pipe(writeStream, {
            end: true
        });

        await finished(writeStream);

        await client.recordings.delete(interaction.interactionId, res.recordingId);

        // clean up
        await client.interactions.delete(interaction.interactionId);

        return NextResponse.json({
            recordsList,
            recordCreate: res,
        });
    } catch (error) {
        console.log(error);
        return NextResponse.json({
            error: error,
        });
    }
}
