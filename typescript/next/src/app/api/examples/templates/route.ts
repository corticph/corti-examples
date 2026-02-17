import { NextResponse } from 'next/server';
import { CortiClient, CortiEnvironment } from '@corti/sdk';

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
        const key = url.searchParams.get('key') ?? undefined;
        const org = url.searchParams.get('org') ?? undefined;
        const lang = url.searchParams.get('lang') ?? undefined;
        const status = url.searchParams.get('status') ?? undefined;

        const client = new CortiClient({
            tenantName,
            environment: CortiEnvironment.Us,
            token,
        });

        if (key) {
            const template = await client.templates.get(key);
            return NextResponse.json({
                template,
                message: 'Get template by key completed successfully',
            });
        }

        const listRequest = org || lang || status ? { org, lang, status } : {};
        const sectionListRequest = org || lang ? { org, lang } : {};

        const listResponse = await client.templates.list(listRequest);
        const sectionListResponse = await client.templates.sectionList(sectionListRequest);

        let templateByKey = null;
        if (listResponse.data?.length) {
            const firstKey = listResponse.data[0].key;
            if (firstKey) {
                templateByKey = await client.templates.get(firstKey);
            }
        }

        return NextResponse.json({
            listCount: listResponse.data?.length ?? 0,
            templates: listResponse.data,
            sectionListCount: sectionListResponse.data?.length ?? 0,
            sections: sectionListResponse.data,
            templateByKey,
            message: 'List templates, list sections, and get by key completed successfully',
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : error },
            { status: 500 }
        );
    }
}
