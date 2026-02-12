'use client';

import { useContext, useEffect } from 'react';
import { AuthContext } from '@/common/AuthContext';

export default function Page() {
    const { getTokenFromCode } = useContext(AuthContext);

    useEffect(() => {
        void getTokenFromCode();
    }, []);

    return (
        <div>
            Callback page. Waiting for access token...
        </div>
    );
}