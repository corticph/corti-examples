'use client';

import { useContext, useEffect, useState } from 'react';
import { Corti } from '@corti/sdk';
import { AuthContext } from '@/common/AuthContext';
import { JsonComponent } from '@/common/JsonComponents';

export default function Page() {
    const { cortiClient } = useContext(AuthContext);

    const [factsGroups, setFactsGroups] = useState<Corti.FactsFactGroupsListResponse | null>(null);
    const [listResponse, setListResponse] = useState<Corti.FactsListResponse | null>(null);
    const [createdFacts, setCreatedFacts] = useState<Corti.FactsCreateResponse | null>(null);
    const [updatedFacts, setUpdatedFacts] = useState<Corti.FactsUpdateResponse | null>(null);
    const [batchUpdate, setBatchUpdate] = useState<Corti.FactsBatchUpdateResponse | null>(null);
    const [interaction, setInteraction] = useState<Corti.InteractionsCreateResponse | null>(null);

    const handleUpdate = async () => {
        setFactsGroups(null);
        setListResponse(null);
        setCreatedFacts(null);
        setUpdatedFacts(null);
        setBatchUpdate(null);
        setInteraction(null);

        if (!cortiClient) return;

        try {
            const interactionResponse = await cortiClient.interactions.create({
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
            setInteraction(interactionResponse);

            const factsGroupsResponse = await cortiClient.facts.factGroupsList();
            setFactsGroups(factsGroupsResponse);

            const listResponseData = await cortiClient.facts.list(interactionResponse.interactionId);
            setListResponse(listResponseData);

            const createdFactsResponse = await cortiClient.facts.create(interactionResponse.interactionId, {
                facts: [{
                    text: 'Patient has trouble breathing',
                    group: 'history-of-present-illness'
                }, {
                    text: 'Patient is experiencing chest pain',
                    group: 'allergies'
                }]
            });
            setCreatedFacts(createdFactsResponse);

            if (createdFactsResponse.facts && createdFactsResponse.facts[0]?.id) {
                const updatedFactsResponse = await cortiClient.facts.update(
                    interactionResponse.interactionId, 
                    createdFactsResponse.facts[0].id,
                    {
                        text: 'Patient has severe trouble breathing',
                        source: 'user'
                    }
                );
                setUpdatedFacts(updatedFactsResponse);

                if (createdFactsResponse.facts[1]?.id) {
                    const batchUpdateResponse = await cortiClient.facts.batchUpdate(interactionResponse.interactionId, {
                        facts: [
                            {
                                factId: createdFactsResponse.facts[0].id,
                                text: 'Patient has minor trouble breathing',
                            },
                            {
                                factId: createdFactsResponse.facts[1].id,
                                text: 'Patient is experiencing severe chest pain',
                            }
                        ]
                    });
                    setBatchUpdate(batchUpdateResponse);
                }
            }

            await cortiClient.interactions.delete(interactionResponse.interactionId);
        } catch (error) {
            console.error('Error fetching facts:', error);
        }
    }

    useEffect(() => {
        void handleUpdate();
    }, []);

    return (
        <div>
            <button onClick={handleUpdate}>Update again</button>
            <div>Interaction: <JsonComponent data={interaction} /></div>
            <div>Fact Groups: <JsonComponent data={factsGroups} /></div>
            <div>List Response: <JsonComponent data={listResponse} /></div>
            <div>Created Facts: <JsonComponent data={createdFacts} /></div>
            <div>Updated Facts: <JsonComponent data={updatedFacts} /></div>
            <div>Batch Update: <JsonComponent data={batchUpdate} /></div>
        </div>
    );
} 