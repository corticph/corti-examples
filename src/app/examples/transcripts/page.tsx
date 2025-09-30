'use client';

import { ChangeEvent, useContext, useState } from 'react';
import { Corti } from '@corti/sdk';
import { AuthContext } from '@/common/AuthContext';
import { useInteraction } from '@/common/useInteraction';
import { JsonComponent } from '@/common/JsonComponents';

export default function Page() {
    const { cortiClient } = useContext(AuthContext);
    const { interaction } = useInteraction();

    const [recording, setRecording] = useState<Corti.RecordingsCreateResponse | null>(null);
    const [transcriptsList, setTranscriptsList] = useState<Corti.TranscriptsListResponse | null>(null);
    const [createdTranscript, setCreatedTranscript] = useState<Corti.TranscriptsResponse | null>(null);
    const [getTranscript, setGetTranscript] = useState<Corti.TranscriptsResponse | null>(null);
    const [deleted, setDeleted] = useState<boolean>(false);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(false);

    async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
        setRecording(null);
        setTranscriptsList(null);
        setCreatedTranscript(null);
        setGetTranscript(null);
        setDeleted(false);
        setError(null);
        setLoading(true);

        try {
            if (!e.target.files || !interaction || !cortiClient) {
                setLoading(false);
                return;
            }

            const file = e.target.files[0];
            if (!file) {
                setLoading(false);
                return;
            }

            const recordingRes = await cortiClient.recordings.upload(file, interaction.id);
            setRecording(recordingRes);

            const list = await cortiClient.transcripts.list(interaction.id);

            setTranscriptsList(list);

            const createdTranscriptRes = await cortiClient.transcripts.create(interaction.id, {
                recordingId: recordingRes.recordingId,
                primaryLanguage: 'en',
            });
            setCreatedTranscript(createdTranscriptRes);

            const getTranscriptRes = await cortiClient.transcripts.get(interaction.id, createdTranscriptRes.id);
            setGetTranscript(getTranscriptRes);

            await cortiClient.transcripts.delete(interaction.id, createdTranscriptRes.id);
            await cortiClient.recordings.delete(interaction.id, recordingRes.recordingId);

            setDeleted(true);
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            {interaction && (
                <input name={'file'} type={'file'} onChange={handleFileUpload} disabled={loading} />
            )}
            {loading && <div>Processing...</div>}
            {recording && <div>Recording: <JsonComponent data={recording} /></div>}
            {transcriptsList && <div>Transcripts List: <JsonComponent data={transcriptsList} /></div>}
            {createdTranscript && <div>Created Transcript: <JsonComponent data={createdTranscript} /></div>}
            {getTranscript && <div>Get Transcript: <JsonComponent data={getTranscript} /></div>}
            {deleted && <div>Deleted: true</div>}
            {error ? <div>Error: <JsonComponent data={error} /></div> : null}
        </div>
    );
}
