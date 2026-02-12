'use client';

import { useContext, useEffect, useState, } from 'react';
import { AuthContext } from '@/common/AuthContext';
import { useInteraction } from '@/common/useInteraction';
import { JsonComponent } from '@/common/JsonComponents';
import { Corti, CortiClient } from '@corti/sdk';

type TranscribeSocket = Awaited<ReturnType<CortiClient['transcribe']['connect']>>
type Messages =
    Corti.TranscribeConfigStatusMessage
    | Corti.TranscribeUsageMessage
    | Corti.TranscribeEndedMessage
    | Corti.TranscribeErrorMessage
    | Corti.TranscribeTranscriptMessage
    | Corti.TranscribeCommandMessage
    | Corti.TranscribeEndMessage;

export default function Page() {
    const { cortiClient } = useContext(AuthContext);
    const { interaction } = useInteraction();

    const [messages, setMessages] = useState<Messages[]>([]);
    const [error, setError] = useState<Error | null>(null);
    const [status, setStatus] = useState<'opened' | 'closed' | 'uninitialized' | 'connecting'>('uninitialized');

    const [actionsAvailable, setActionsAvailable] = useState<boolean>(false);
    const [ws, setWs] = useState<TranscribeSocket | null>(null);

    async function handleSocketConnect() {
        if (!interaction || !cortiClient) {
            return;
        }

        setStatus('connecting');

        const ws = await cortiClient.transcribe.connect({
            configuration: {
                primaryLanguage: 'en'
            },
        });

        ws.on('message', (message) => {
            setMessages(messages => ([...messages, message]));

            if (message.type === 'CONFIG_ACCEPTED') {
                setActionsAvailable(true);
            }
        });
        ws.on('error', (error) => {
            setError(error);
        });
        ws.on('close', () => {
            setStatus('closed');
        });
        ws.on('open', () => {
            setStatus('opened');

            setWs(ws);
        });

        return () => {
            ws.close();
        }
    }

    useEffect(() => {
        if (!interaction || !cortiClient) {
            return;
        }

        const closehandler = handleSocketConnect();

        return () => {
            closehandler.then(foo => foo && foo());

            setMessages([]);
            setError(null);
            setStatus('uninitialized');
        }
    }, [interaction, cortiClient]);

    function handleEndClick() {
        const message = {
            type: 'end' as const,
        };

        ws?.sendEnd(message);

        setMessages(messages => ([...messages, message]));
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files || !ws) {
            return;
        }

        for (const file of e.target.files) {
            const reader = new FileReader();

            reader.onload = () => {
                if (reader.result) {
                    const CHUNK_SIZE = 60000;
                    const buffer = reader.result as ArrayBuffer;
                    let offset = 0;
                    while (offset < buffer.byteLength) {
                        const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
                        ws.sendAudio(chunk);
                        offset += CHUNK_SIZE;
                    }
                }
            };

            reader.onerror = () => {
                console.log(reader.error);
            };

            reader.readAsArrayBuffer(file);
        }
    }

    return (
        <div>
            <div className={'flex gap-6'}>
                Transcribe WS: {status}
                {actionsAvailable && <button onClick={handleEndClick}>Send end of stream</button>}
                {actionsAvailable && <input type={'file'} onChange={handleFileUpload}></input>}
            </div>
            <div>
                Messages:
                {messages.map((message, index) =>
                    <JsonComponent key={index} data={message} />
                )}
            </div>
            {error && <div>Error: <JsonComponent data={error} /></div>}
        </div>
    );
}
