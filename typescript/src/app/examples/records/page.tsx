'use client';

import { ChangeEvent, useContext, useState } from 'react';
import { Corti } from '@corti/sdk';
import { AuthContext } from '@/common/AuthContext';
import { useInteraction } from '@/common/useInteraction';
import { JsonComponent } from '@/common/JsonComponents';

export default function Page() {
    const [file, setFile] = useState<Corti.RecordingsCreateResponse | null>(null);
    const { cortiClient } = useContext(AuthContext);
    const { interaction, setInteraction } = useInteraction();

    async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
        try {
            if (!e.target.files || !interaction || !cortiClient) {
                return;
            }

            for (const file of e.target.files) {
                const res = await cortiClient.recordings.upload(file, interaction.id);

                setFile(res);
            }
        } catch (e) {
            console.error('Error uploading recording:', e);
        }
    }

    async function handleDownload() {
        if (!cortiClient || !interaction || !file) {
            return;
        }

        const fileData = await cortiClient.recordings.get(interaction.id, file.recordingId);
        const blob  = await fileData.blob();

        const anchor: HTMLAnchorElement = document.createElement('a');
        const url = URL.createObjectURL(blob);
        anchor.href = url;
        anchor.download = 'file.mp3';
        anchor.target = '_blank';
        anchor.click();
        anchor.remove();

        URL.revokeObjectURL(url);
    }

    async function handleDelete() {
        if (!cortiClient || !interaction || !file) {
            return;
        }

        await cortiClient.recordings.delete(interaction.id, file.recordingId);
        await cortiClient.interactions.delete(interaction.id);

        setInteraction(null);
        setFile(null);
    }

    return (
        <div>
            <input name={'file'} type={'file'} onChange={handleFileUpload} />
            {file && <div>Recording uploaded: <JsonComponent data={file} /></div>}
            {file && <button onClick={handleDownload}>Download file back</button>}
            {file && <button onClick={handleDelete}>Delete recording</button>}
        </div>
    );
}