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
    const message =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : error != null && typeof error === 'object' && 'message' in error
                ? String((error as { message: unknown }).message)
                : String(error ?? 'Unknown error');
    return NextResponse.json(
        { error: message || 'Internal server error' },
        { status: 500 }
    );
}
