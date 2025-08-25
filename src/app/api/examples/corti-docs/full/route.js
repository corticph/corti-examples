import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';
import * as rw from 'fs';

export async function GET() {
    try {
        function startClient(){
            const client = new CortiClient({
                environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID === 'eu'
                    ? CortiEnvironment.Eu
                    : process.env.NEXT_PUBLIC_ENVIRONMENT_ID,
                auth: {
                    clientId: process.env.NEXT_PUBLIC_CLIENT_ID,
                    clientSecret: process.env.CLIENT_SECRET,
                },
                tenantName: process.env.NEXT_PUBLIC_TENANT_NAME,
            });

            return client;
        }

        async function startInteraction(client){
            let intRes = await client.interactions.create({
                encounter: {
                    identifier: 'GUID OF YOUR CHOOSING 8',
                    status: 'planned',
                    type: 'first_consultation'
                }
            });
            return intRes;
        }

        async function uploadRecording(client, interactId){
            const file = rw.createReadStream('public/trouble-breathing.mp3', { autoClose: true });
            let res = await client.recordings.upload(file, interactId);
            return res;
        }

        async function generateTranscript(client, recordingId, interactId){
            let transcriptResult = await client.transcripts.create(interactId, {
                recordingId: recordingId,
                primaryLanguage: 'en',
                modelName: 'premier'
            });
            return transcriptResult;
        }

        async function generateDocument(client, interactId, transcriptResult){
            let documentResult = await client.documents.create(interactId, {
                context: [{
                    type: 'transcript',
                    data: transcriptResult.transcripts[0]
                }],
                templateKey: 'soap',
                outputLanguage: 'en'
            });
            return documentResult;
        }

        async function getDocument(client, interactId, documentId){
            let document = await client.documents.get(interactId, documentId);
            return document;
        }

        async function workflow(){
            const clientPassed = startClient();
            const interactionResult = await startInteraction(clientPassed);
            const uploadResult = await uploadRecording(clientPassed, interactionResult.interactionId);
            const transcriptResult = await generateTranscript(clientPassed, uploadResult.recordingId, interactionResult.interactionId);
            const documentResult = await generateDocument(clientPassed, interactionResult.interactionId, transcriptResult);
            const document = await getDocument(clientPassed, interactionResult.interactionId, documentResult.id);

            return {
                interaction: interactionResult,
                recording: uploadResult,
                transcript: transcriptResult,
                documentCreation: documentResult,
                document: document
            }
        }

        return NextResponse.json({
            data: await workflow()
        });
    } catch (error) {
        console.log(error);
        return NextResponse.json({
            error: error,
        });
    }
}
