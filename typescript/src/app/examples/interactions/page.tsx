'use client';

import { useContext, useEffect, useState } from 'react';
import { Corti } from '@corti/sdk';
import { AuthContext } from '@/common/AuthContext';
import { JsonComponent } from '@/common/JsonComponents';

export default function Page() {
    const { cortiClient } = useContext(AuthContext);

    const [interactions, setInteractions] = useState<Corti.InteractionsGetResponse[]>([]);
    const [createInteraction, setCreateInteraction] = useState<Corti.InteractionsCreateResponse | null>(null);
    const [interactionGet, setInteractionGet] = useState<Corti.InteractionsGetResponse | null>(null);
    const [interactionUpdate, setInteractionUpdate] = useState<Corti.InteractionsGetResponse | null>(null);

    const handleUpdate = async () => {
        setInteractions([]);
        setCreateInteraction(null);
        setInteractionGet(null);
        setInteractionUpdate(null);

        if (!cortiClient) return;

        try {
            const list = await cortiClient.interactions.list();
            const collectedData = [];

            for await (const item of list) {
                collectedData.push(item);
            }

            setInteractions(collectedData);

            const interactionCreate = await cortiClient.interactions.create({
                encounter: {
                    identifier: Date.now().toString(),
                    status: 'planned',
                    type: 'first_consultation'
                }
            });

            setCreateInteraction(interactionCreate);

            const interactionGet = await cortiClient.interactions.get(interactionCreate.interactionId);

            setInteractionGet(interactionGet);

            const interactionUpdate = await cortiClient.interactions.update(interactionCreate.interactionId, {
                encounter: {
                    status: 'in-progress',
                }
            });

            setInteractionUpdate(interactionUpdate);

            await cortiClient.interactions.delete(interactionCreate.interactionId);
        } catch (error) {
            console.error('Error fetching interactions:', error);
        }
    }

    useEffect(() => {
        void handleUpdate();
    }, []);

    return (
        <div>
            <button onClick={handleUpdate}>Update again</button>
            <div>Interactions: {interactions.length}</div>
            <div>Created: <JsonComponent data={createInteraction} /></div>
            <div>Get: <JsonComponent data={interactionGet} /></div>
            <div>Update: <JsonComponent data={interactionUpdate} /></div>
        </div>
    );
}
