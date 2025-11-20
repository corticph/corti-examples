'use client';

import { useContext, useState } from 'react';
import { AuthContext } from '@/common/AuthContext';
import Link from 'next/link';

export default function Home() {
    const {
        handleCodeAuthRedirect,
        cortiClient,
        getClientCredentialsToken,
        handlePkceAuthRedirect,
        getRopcToken
    } = useContext(AuthContext);

    const [ropcCredentials, setRopcCredentials] = useState({
        username: '',
        password: ''
    });

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
        <div className={'flex flex-col gap-4'}>
            <div className={'flex gap-4'}>
                <button onClick={handleCodeAuthRedirect}>Get client with Authorization code flow</button>
                <button onClick={getClientCredentialsToken}>Get client with Client credentials flow</button>
                <button onClick={handlePkceAuthRedirect}>Get client with PKCE flow</button>
            </div>
            <div className={'flex flex-col gap-2 w-1/4'}>
                <input
                    type="text"
                    placeholder="Username"
                    value={ropcCredentials.username}
                    onChange={(e) => setRopcCredentials({ ...ropcCredentials, username: e.target.value })}
                    className={'border p-2'}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={ropcCredentials.password}
                    onChange={(e) => setRopcCredentials({ ...ropcCredentials, password: e.target.value })}
                    className={'border p-2'}
                />
                <button 
                    onClick={() => getRopcToken(ropcCredentials.username, ropcCredentials.password)}
                    disabled={!ropcCredentials.username || !ropcCredentials.password}
                >
                    Get client with ROPC flow
                </button>
            </div>
        </div>
    );
}
