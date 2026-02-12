import { NextResponse } from 'next/server';
import { CortiClient } from '@corti/sdk';

export async function GET() {
    try {
        const client = new CortiClient({
            tenantName: process.env.NEXT_PUBLIC_TENANT_NAME!,
            environment: process.env.NEXT_PUBLIC_ENVIRONMENT_ID!,
            auth: {
                clientId: process.env.NEXT_PUBLIC_CLIENT_ID!,
                clientSecret: process.env.CLIENT_SECRET!,
            },
        });

        // Get all templates
        const allTemplates = await client.templates.list();

        // Get template sections with filters
        const filteredSections = await client.templates.sectionList({
            lang: 'en'
        });

        // Get a specific template by key (if any templates exist)
        let specificTemplate = null;

        if (allTemplates.data && allTemplates.data.length > 0) {
            const firstTemplate = allTemplates.data[0];

            if (firstTemplate.key) {
                specificTemplate = await client.templates.get(firstTemplate.key);
            }
        }

        return NextResponse.json({
            allTemplates,
            filteredSections,
            specificTemplate,
            message: 'Example of templates API operations'
        });
    } catch (error) {
        return NextResponse.json({
            error: error,
        });
    }
} 