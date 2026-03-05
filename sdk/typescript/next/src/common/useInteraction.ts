import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '@/common/AuthContext';
import { Corti } from '@corti/sdk';

export function useInteraction() {
    const { cortiClient } = useContext(AuthContext);
    const [interaction, setInteraction] = useState<Corti.InteractionsGetResponse | null>(null);

    useEffect(() => {
        if (!cortiClient) return;

        cortiClient.interactions.create({
            encounter: {
                identifier: performance.now().toString(),
                status: 'planned',
                type: 'first_consultation'
            }
        })
            .then((interaction) => cortiClient.interactions.get(interaction.interactionId))
            .then((interaction) => setInteraction(interaction));

        return () => {
            if (!cortiClient || !interaction) return;

            cortiClient.interactions.delete(interaction.id);
            setInteraction(null);
        }
    }, []);

    return {
        interaction,
        setInteraction,
    };
};
