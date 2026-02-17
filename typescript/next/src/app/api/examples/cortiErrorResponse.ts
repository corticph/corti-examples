import { NextResponse } from 'next/server';
import { CortiError } from '@corti/sdk';

export function cortiErrorResponse(error: unknown): NextResponse {
    if (error instanceof CortiError) {
        return NextResponse.json(
            {
                statusCode: error.statusCode,
                message: error.message,
                body: error.body,
                rawResponse: error.rawResponse,
            },
            { status: error.statusCode ?? 500 }
        );
    }
    return NextResponse.json(
        { error: error instanceof Error ? error.message : error },
        { status: 500 }
    );
}
