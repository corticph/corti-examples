import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';
import { cortiErrorResponse } from '../cortiErrorResponse';

export async function GET(request: Request) {
    try {
        const token = new URL(request.url).searchParams.get('token');
        if (!token) {
            return NextResponse.json(
                { error: 'Missing required query parameter: token' },
                { status: 400 }
            );
        }
        const tenantName = process.env.NEXT_PUBLIC_TENANT_NAME;
        if (!tenantName) {
            return NextResponse.json(
                { error: 'Missing NEXT_PUBLIC_TENANT_NAME' },
                { status: 400 }
            );
        }

        const url = new URL(request.url);
        const limit = url.searchParams.get('limit');
        const offset = url.searchParams.get('offset');
        const ephemeral = url.searchParams.get('ephemeral');

        const client = new CortiClient({
            tenantName,
            environment: CortiEnvironment.Us,
            auth: { accessToken: token },
        });

        const listRequest: { limit?: number; offset?: number; ephemeral?: boolean } = {};
        if (limit != null && limit !== '') {
            listRequest.limit = parseInt(limit, 10);
        }
        if (offset != null && offset !== '') {
            listRequest.offset = parseInt(offset, 10);
        }
        if (ephemeral === 'true') {
            listRequest.ephemeral = true;
        }

        const agentsList = await client.agents.list(listRequest);

        const createdAgent = await client.agents.create({
            name: 'SDK Example Agent',
            description: 'Example agent created via SDK for list and create demo.',
        });

        const getAgent = await client.agents.get(createdAgent.id);

        const agentCard = await client.agents.getCard(createdAgent.id);

        const registryExperts = await client.agents.getRegistryExperts({ limit: 10, offset: 0 });

        const messageSendResponse = await client.agents.messageSend(createdAgent.id, {
            message: {
                role: 'user',
                parts: [{ kind: 'text', text: 'Hello from SDK example' }],
                messageId: `msg-${Date.now()}`,
                kind: 'message',
            },
        });

        let getTaskResult: Awaited<ReturnType<typeof client.agents.getTask>> | null = null;
        let getContextResult: Awaited<ReturnType<typeof client.agents.getContext>> | null = null;
        if (messageSendResponse.task) {
            getTaskResult = await client.agents.getTask(createdAgent.id, messageSendResponse.task.id);
            getContextResult = await client.agents.getContext(
                createdAgent.id,
                messageSendResponse.task.contextId,
            );
        }

        // PATCH /agents/{id} – commented out until endpoint works
        // const updatedAgent = await client.agents.update(createdAgent.id, { ... });

        await client.agents.delete(createdAgent.id);

        return NextResponse.json({
            listCount: agentsList.length,
            agents: agentsList,
            createdAgent,
            getAgent,
            agentCard,
            registryExpertsCount: registryExperts.experts?.length ?? 0,
            registryExperts: registryExperts.experts,
            messageSendResponse,
            getTask: getTaskResult ?? undefined,
            getContext: getContextResult ?? undefined,
            deletedAgentId: createdAgent.id,
            message: 'Agents list, create, get, card, registry experts, message send, get task/context, and delete completed successfully',
        });
    } catch (error) {
        return cortiErrorResponse(error);
    }
}
