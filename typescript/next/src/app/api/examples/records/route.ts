import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'stream/promises';
import { ReadableStream } from 'node:stream/web';

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
