import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';
import { cortiErrorResponse } from '../cortiErrorResponse';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CHUNK_SIZE = 60_000;
const AUDIO_PATH = join(process.cwd(), 'public', 'trouble-breathing.mp3');
const OPEN_AND_CONFIG_TIMEOUT_MS = 15_000;
const FLUSH_TIMEOUT_MS = 30_000;

export async function GET(request: Request) {
    try {
        const rawToken = new URL(request.url).searchParams.get('token');
        const interactionIdParam = new URL(request.url).searchParams.get('interactionId');
        if (!rawToken) {
            return NextResponse.json(
                { error: 'Missing required query parameter: token' },
                { status: 400 }
            );
        }
        const token = rawToken.startsWith('Bearer ') ? rawToken : `Bearer ${rawToken}`;
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
            auth: { accessToken: rawToken },
        });

        let interactionId = interactionIdParam?.trim() || null;
        if (!interactionId) {
            const created = await client.interactions.create({
                encounter: {
                    identifier: String(Date.now()),
                    status: 'planned',
                    type: 'first_consultation',
                },
                patient: {
                    identifier: String(Date.now()),
                    gender: 'unknown',
                },
            });
            interactionId = created.interactionId;
        }

        const socket = await client.stream.connect({
            id: interactionId,
            tenantName,
            token,
        });

        await socket.waitForOpen();

        const messages: unknown[] = [];

        let configAcceptedResolve: () => void;
        let configAcceptedReject: (err: Error) => void;
        const configAcceptedPromise = new Promise<void>((resolve, reject) => {
            configAcceptedResolve = resolve;
            configAcceptedReject = reject;
        });

        let flushedResolve: () => void;
        let flushedReject: (err: Error) => void;
        const flushedPromise = new Promise<void>((resolve, reject) => {
            flushedResolve = resolve;
            flushedReject = reject;
        });

        const timeout = (ms: number, label: string) =>
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Stream ${label} timed out after ${ms}ms`)), ms)
            );

        const onMessage = (message: unknown) => {
            messages.push(message);
            const type = (message as { type?: string }).type;
            if (type === 'CONFIG_ACCEPTED') {
                configAcceptedResolve();
            }
            if (type === 'flushed') {
                flushedResolve();
            }
        };

        socket.on('message', onMessage);

        const fail = (err: Error) => {
            configAcceptedReject(err);
            flushedReject(err);
        };
        socket.on('error', (err: Error) => fail(err));
        socket.on('close', () => fail(new Error('Stream WebSocket closed before completion')));

        socket.sendConfiguration({
            type: 'config',
            configuration: {
                transcription: {
                    primaryLanguage: 'en',
                    participants: [],
                },
                mode: {
                    type: 'transcription',
                },
            },
        });

        await Promise.race([
            configAcceptedPromise,
            timeout(OPEN_AND_CONFIG_TIMEOUT_MS, 'config acceptance'),
        ]);

        if (!existsSync(AUDIO_PATH)) {
            socket.close();
            return NextResponse.json(
                { error: `Sample audio file not found at ${AUDIO_PATH}. Add trouble-breathing.mp3 to public/ to run the stream example.` },
                { status: 400 }
            );
        }

        const audioBuffer = readFileSync(AUDIO_PATH);
        let offset = 0;
        while (offset < audioBuffer.length) {
            const chunk = audioBuffer.subarray(offset, offset + CHUNK_SIZE);
            socket.sendAudio(chunk);
            offset += CHUNK_SIZE;
        }

        socket.sendFlush({ type: 'flush' });

        await Promise.race([
            flushedPromise,
            timeout(FLUSH_TIMEOUT_MS, 'flush/flushed'),
        ]);

        socket.close();

        return NextResponse.json({
            interactionId,
            messageCount: messages.length,
            messages,
            message: 'Stream WebSocket: config sent, audio sent by chunks, flush sent, flushed received.',
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        if (/non-101|network error|status code/i.test(message)) {
            return NextResponse.json(
                {
                    error:
                        'Stream WebSocket connection failed: the server did not accept the upgrade (expected HTTP 101). Check your token, NEXT_PUBLIC_TENANT_NAME, interaction id, and that the stream service is enabled.',
                    code: 'STREAM_UPGRADE_FAILED',
                    originalMessage: message,
                },
                { status: 502 }
            );
        }
        return cortiErrorResponse(error);
    }
}
