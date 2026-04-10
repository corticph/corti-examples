/**
 * Chat API Route
 *
 * This API endpoint handles chat interactions between the user and the Corti agent.
 * It uses the AI SDK's streaming format to enable real-time message streaming.
 *
 * Flow:
 * 1. Receive user message from frontend (via AI SDK's useChat hook)
 * 2. Get the singleton agent instance
 * 3. Send message to agent via A2A client
 * 4. Stream the agent's response back to the frontend
 * 5. Use the ai-sdk-adapter to convert A2A stream format to AI SDK format
 * 6. Handle errors gracefully with user-facing error messages
 */

import {
	buildParams,
	type CortiUIMessage,
	toUIMessageStream,
} from "@corti/ai-sdk-adapter";
import { createUIMessageStreamResponse } from "ai";
import { getAgent } from "@/lib/agent";

/**
 * POST /api/chat
 *
 * Handles incoming chat messages and streams agent responses back to the client.
 *
 * Request body (sent by AI SDK's useChat):
 * {
 *   messages: Array<CortiUIMessage> - Messages with parts array containing text/tool call parts
 * }
 *
 * Response: Streaming response in AI SDK format (UIMessageStreamResponse)
 */
export async function POST(req: Request) {
	try {
		// Parse the incoming request body
		// The AI SDK's useChat hook sends an array of messages
		const { messages } = await req.json();

		// Validate that we have messages
		if (!messages || !Array.isArray(messages) || messages.length === 0) {
			return new Response(JSON.stringify({ error: "No messages provided" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Get the last user message (the most recent message sent by the user)
		const lastMessage = messages[messages.length - 1];
		if (!lastMessage || lastMessage.role !== "user") {
			return new Response(
				JSON.stringify({ error: "Last message must be from user" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		console.log(`[API] Received message: ${lastMessage.content}`);

		/**
		 * Get the singleton agent instance
		 *
		 * This retrieves the agent that was initialized once on server startup.
		 */
		const { a2aClient } = await getAgent();

		/**
		 * Build A2A parameters from UI messages
		 *
		 * The buildParams function from the adapter converts the UI messages
		 * into the format expected by the A2A protocol.
		 */
		const a2aParams = buildParams(messages as CortiUIMessage[]);

		console.log(`[API] Sending message to A2A agent`);

		/**
		 * Send message and get streaming response
		 *
		 * The A2A client's sendMessageStream method returns an async generator
		 * that yields events as the agent processes the message and streams the response.
		 */
		const a2aStream = a2aClient.sendMessageStream(a2aParams);

		/**
		 * Convert A2A stream to UI message stream
		 *
		 * The toUIMessageStream function from the adapter converts the A2A event
		 * stream into the UI message chunk format expected by the AI SDK.
		 */
		const uiMessageStream = toUIMessageStream(a2aStream);

		/**
		 * Return the streaming response
		 *
		 * The createUIMessageStreamResponse function from AI SDK converts the UI
		 * message stream into a format that the frontend can consume.
		 * This enables real-time streaming of the agent's response to the user interface.
		 */
		return createUIMessageStreamResponse({ stream: uiMessageStream });
	} catch (error) {
		/**
		 * Error handling
		 *
		 * Catch any errors that occur during message processing and return
		 * user-friendly error messages. This ensures the frontend can display
		 * helpful error messages instead of crashing.
		 */
		console.error("[API] Error processing chat message:", error);

		// Determine the error message to show to the user
		const errorMessage =
			error instanceof Error
				? error.message
				: "An unexpected error occurred while processing your message.";

		// Return a proper error response
		return new Response(
			JSON.stringify({
				error: errorMessage,
				details:
					"Please check your Corti configuration and try again. If the problem persists, verify that your credentials are correct and the agent is properly initialized.",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}
