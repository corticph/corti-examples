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

        if (!existsSync(AUDIO_PATH)) {
            return NextResponse.json(
                { error: `Sample audio file not found at ${AUDIO_PATH}. Add trouble-breathing.mp3 to public/ to run the transcribe example.` },
                { status: 400 }
            );
        }

        const client = new CortiClient({
            tenantName,
            environment: CortiEnvironment.Us,
            token: rawToken,
        });

        const socket = await client.transcribe.connect({
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
                setTimeout(() => reject(new Error(`Transcribe ${label} timed out after ${ms}ms`)), ms)
            );

        const onMessage = (message: unknown) => {
            messages.push(message);
            const type = (message as { type?: string }).type;
            if (type === 'CONFIG_ACCEPTED') {
                configAcceptedResolve();
            }
            if (type === 'CONFIG_DENIED' || type === 'CONFIG_TIMEOUT') {
                configAcceptedReject(new Error(`Config not accepted: ${type}`));
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
        socket.on('close', () => fail(new Error('Transcribe WebSocket closed before completion')));

        socket.sendConfiguration({
            type: 'config',
            configuration: { primaryLanguage: 'en' },
        });

        await Promise.race([
            configAcceptedPromise,
            timeout(OPEN_AND_CONFIG_TIMEOUT_MS, 'config acceptance'),
        ]);

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
            messageCount: messages.length,
            messages,
            message: 'Transcribe WebSocket: config sent, audio sent by chunks, flush sent, flushed received.',
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        if (/non-101|network error|status code/i.test(message)) {
            return NextResponse.json(
                {
                    error:
                        'Transcribe WebSocket connection failed: the server did not accept the upgrade (expected HTTP 101). This usually means the upgrade request was rejected—e.g. invalid or expired token, wrong tenant, or transcribe not available for this environment. Check your token, NEXT_PUBLIC_TENANT_NAME, and that the transcribe service is enabled.',
                    code: 'TRANSCRIBE_UPGRADE_FAILED',
                    originalMessage: message,
                },
                { status: 502 }
            );
        }
        return cortiErrorResponse(error);
    }
}
