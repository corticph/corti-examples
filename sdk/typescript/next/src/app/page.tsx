'use client';

import { useContext } from 'react';
import { AuthContext } from '@/common/AuthContext';
import Link from 'next/link';

export default function Home() {
    const {
        handleCodeAuthRedirect,
        cortiClient,
        getClientCredentialsToken
    } = useContext(AuthContext);

    if (cortiClient) {
        return (
            <div className={'flex flex-col gap-4'}>
                <div>Authenticated 👌</div>
                <div><Link href={'/examples/interactions'}>/interactions</Link></div>
                <div><Link href={'/examples/records'}>/records</Link></div>
                <div><Link href={'/examples/stream'}>/stream</Link></div>
                <div><Link href={'/examples/transcribe'}>/transcribe</Link></div>
                <div><Link href={'/examples/templates'}>/templates</Link></div>
                <div><Link href={'/examples/facts'}>/facts</Link></div>
                <div><Link href={'/examples/documents'}>/documents</Link></div>
                <div><Link href={'/examples/transcripts'}>/transcripts</Link></div>
            </div>
        )
    }

    return (
        <div className={'flex gap-4'}>
            <button onClick={handleCodeAuthRedirect}>Get client with Authorization code flow</button>
            <button onClick={getClientCredentialsToken}>Get client with Client credentials flow</button>
        </div>
    );
}
