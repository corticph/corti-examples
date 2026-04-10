/**
 * Agent Singleton Module
 *
 * This module initializes a Corti agent once when the server starts and exports
 * it for reuse across all API requests.
 *
 * Flow:
 * 1. Initialize CortiClient with credentials from environment variables
 * 2. Create an agent using the Corti SDK
 * 3. Initialize an A2A (Agent-to-Agent) client for communication
 * 4. Export the initialized agent and A2A client for use in API routes
 */

import type { Client } from "@a2a-js/sdk/client";
import { CortiClient } from "@corti/sdk";

// Validate required environment variables at startup
if (!process.env.TENANT) {
	throw new Error("Missing required environment variable: TENANT");
}
if (!process.env.CLIENT_ID) {
	throw new Error("Missing required environment variable: CLIENT_ID");
}
if (!process.env.CLIENT_SECRET) {
	throw new Error("Missing required environment variable: CLIENT_SECRET");
}

const environment = (process.env.ENVIRONMENT || "eu") as "eu" | "us";

/**
 * Initialize the Corti SDK client with OAuth credentials
 *
 * The client uses client credentials flow (machine-to-machine authentication)
 * to authenticate with the Corti API. This is the recommended approach for
 * server-side applications.
 */
const cortiClient = new CortiClient({
	tenantName: process.env.TENANT,
	environment,
	auth: {
		clientId: process.env.CLIENT_ID,
		clientSecret: process.env.CLIENT_SECRET,
	},
});

/**
 * Agent initialization state
 *
 * We use a singleton pattern to ensure the agent is created only once when
 * the server starts. The promise is cached so that if multiple requests come
 * in during initialization, they all wait for the same agent creation.
 */
let agentPromise: Promise<{
	agentId: string;
	a2aClient: Client;
}> | null = null;

/**
 * Initialize the agent and A2A client
 *
 * This function creates a Corti agent with basic configuration and initializes
 * an A2A client for real-time communication. The agent is created as ephemeral,
 * meaning it will not appear in the list of agents returned by cortiClient.agents.list().
 *
 * @returns Promise resolving to agent ID and A2A client instance
 */
async function initializeAgent() {
	console.log("[Agent] Initializing Corti agent...");

	// Create a new agent using the Corti SDK
	// This agent will handle all chat interactions
	const agent = await cortiClient.agents.create({
		name: "Next.js Chat Demo Agent",
		description:
			"A demo agent for showcasing A2A chat integration with Next.js",
		// Ephemeral agents are automatically cleaned up by Corti
		ephemeral: true,
	});

	console.log(`[Agent] Created agent with ID: ${agent.id}`);

	/**
	 * Get an access token from the Corti SDK
	 *
	 * The SDK handles token management and refresh automatically.
	 * We just need to pass this token to the A2A client for authentication.
	 */

	const getToken = () => {
		console.log("[Agent] Getting access token from Corti SDK");
		return cortiClient.auth.getToken({
			clientId: process.env.CLIENT_ID as string,
			clientSecret: process.env.CLIENT_SECRET as string,
		});
	};

	/**
	 * Create authenticated fetch function
	 *
	 * This adds the Bearer token to all A2A requests.
	 * The Corti SDK handles token refresh automatically.
	 */
	const authenticatedFetch = async (
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		const headers = new Headers(init?.headers);
		headers.set("Authorization", `Bearer ${(await getToken()).accessToken}`);
		headers.set("Tenant-Name", process.env.TENANT as string);

		return fetch(input, {
			...init,
			headers,
		});
	};

	/**
	 * Initialize the A2A client with authenticated fetch
	 *
	 * We pass the authenticated fetch to both the transport factory and
	 * the agent card resolver so all requests include the Bearer token.
	 */
	const { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory } =
		await import("@a2a-js/sdk/client");

	const factory = new ClientFactory({
		transports: [
			new JsonRpcTransportFactory({
				fetchImpl: authenticatedFetch,
			}),
		],
		cardResolver: new DefaultAgentCardResolver({
			fetchImpl: authenticatedFetch,
		}),
	});

	// Construct the agent card URL from the Corti environment
	const cardUrl = `https://api.${environment}.corti.app/agents/${agent.id}/agent-card.json`;

	const a2aClient = await factory.createFromUrl(cardUrl, "");

	console.log(
		"[Agent] A2A client initialized successfully with authentication",
	);

	return {
		agentId: agent.id,
		a2aClient,
	};
}

/**
 * Get the initialized agent and A2A client
 *
 * This function implements the singleton pattern:
 * - First call: Creates the agent and caches the promise
 * - Subsequent calls: Return the same cached agent
 * @returns Promise resolving to agent ID and A2A client instance
 */
export async function getAgent() {
	if (!agentPromise) {
		agentPromise = initializeAgent();
	}
	return agentPromise;
}
