/**
 * Chat Page Component
 *
 * This is the main page of the application. It provides a simple chat interface
 * where users can send messages to the Corti agent and receive streaming responses.
 *
 * Key features:
 * - Uses AI SDK's useChat hook for state management and streaming
 * - Display of conversation history (user and assistant messages)
 * - Loading states while the agent is responding
 * - Error handling with user-friendly error messages
 * - Simple, clean UI with Tailwind CSS
 */

"use client";

import { useChat } from "@ai-sdk/react";
import type { CortiUIMessage } from "@corti/ai-sdk-adapter";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export default function ChatPage() {
	/**
	 * Initialize the useChat hook from AI SDK
	 *
	 * The useChat hook handles all the complex streaming logic for us:
	 * - messages: Array of all messages in the conversation
	 * - sendMessage: Function to send a message to the API
	 * - status: Current chat status ('ready', 'submitted', 'streaming', 'error')
	 * - error: Any error that occurred during message processing
	 *
	 * We provide a DefaultChatTransport that points to our /api/chat endpoint.
	 */
	const { messages, sendMessage, status, error } = useChat<CortiUIMessage>({
		transport: new DefaultChatTransport({
			api: "/api/chat",
		}),
	});

	/**
	 * Manage input state manually
	 *
	 * The useChat hook doesn't provide form helpers, so we manage
	 * the input field state ourselves.
	 */
	const [input, setInput] = useState("");

	/**
	 * Handle form submission
	 *
	 * This sends the user's message using the sendMessage function from useChat.
	 */
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!input.trim() || status === "streaming" || status === "submitted")
			return;

		// Send the message using the AI SDK's sendMessage function
		await sendMessage({ text: input.trim() });

		// Clear the input field
		setInput("");
	};

	const isLoading = status === "streaming" || status === "submitted";

	return (
		<div className="flex min-h-screen flex-col">
			{/* Header */}
			<header className="border-b border-gray-200 bg-white px-4 py-4">
				<div className="mx-auto max-w-3xl">
					<h1 className="text-2xl font-bold text-gray-900">
						Corti Agent Chat Demo
					</h1>
					<p className="mt-1 text-sm text-gray-500">
						Powered by Corti SDK, A2A streaming, and Vercel AI SDK
					</p>
				</div>
			</header>

			{/* Main chat container */}
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
				{/* Messages container */}
				<div className="space-y-4">
					{/**
					 * Display conversation messages
					 *
					 * The messages array contains UIMessage objects from the AI SDK.
					 * Each message has:
					 * - id: Unique identifier
					 * - role: Either 'user' or 'assistant'
					 * - parts: Array of message parts (text, files, tool calls, etc.)
					 *
					 * We extract text content from the parts array for display.
					 */}
					{messages.length === 0 ? (
						// Empty state when no messages
						<div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
							<p className="text-gray-500">
								Start a conversation with the Corti agent by typing a message
								below.
							</p>
						</div>
					) : (
						messages.map((message) => {
							// Extract text content from message parts
							const textContent = message.parts
								.filter((part) => part.type === "text")
								.map((part) => part.text)
								.join("");

							return (
								<div
									key={message.id}
									className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
								>
									<div
										className={`max-w-[80%] rounded-lg px-4 py-2 ${
											message.role === "user"
												? "bg-blue-600 text-white"
												: "bg-white text-gray-900 border border-gray-200"
										}`}
									>
										{/* Role label */}
										<div className="mb-1 text-xs font-semibold uppercase opacity-70">
											{message.role === "user" ? "You" : "Agent"}
										</div>
										{/* Message content */}
										<div className="whitespace-pre-wrap">{textContent}</div>
										{status === "streaming" &&
											message.role === "assistant" &&
											messages[messages.length - 1] === message && (
												<div className="flex items-center gap-2 text-gray-500">
													<div className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
													<div
														className="h-2 w-2 animate-pulse rounded-full bg-gray-400"
														style={{ animationDelay: "0.2s" }}
													/>
													<div
														className="h-2 w-2 animate-pulse rounded-full bg-gray-400"
														style={{ animationDelay: "0.4s" }}
													/>
													<span className="ml-2 text-sm">Thinking...</span>
												</div>
											)}
									</div>
								</div>
							);
						})
					)}

					{/**
					 * Loading indicator
					 *
					 * Show a visual indicator when the agent is processing and streaming
					 * a response. The status from useChat tells us when the agent is working.
					 */}
					{status === "submitted" && (
						<div className="flex justify-start">
							<div className="max-w-[80%] rounded-lg border border-gray-200 bg-white px-4 py-2">
								<div className="mb-1 text-xs font-semibold uppercase text-gray-500">
									Agent
								</div>
								<div className="flex items-center gap-2 text-gray-500">
									<div className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
									<div
										className="h-2 w-2 animate-pulse rounded-full bg-gray-400"
										style={{ animationDelay: "0.2s" }}
									/>
									<div
										className="h-2 w-2 animate-pulse rounded-full bg-gray-400"
										style={{ animationDelay: "0.4s" }}
									/>
									<span className="ml-2 text-sm">Thinking...</span>
								</div>
							</div>
						</div>
					)}

					{/**
					 * Error display
					 *
					 * If an error occurs during message processing, display it to the user
					 * with clear, actionable information. This helps users understand what
					 * went wrong and how to fix it.
					 */}
					{error && (
						<div className="rounded-lg border border-red-200 bg-red-50 p-4">
							<div className="flex items-start gap-3">
								<div className="text-red-600">
									<svg
										className="h-5 w-5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										role="img"
										aria-label="Error icon"
									>
										<title>Error</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								</div>
								<div className="flex-1">
									<h3 className="text-sm font-semibold text-red-800">Error</h3>
									<p className="mt-1 text-sm text-red-700">{error.message}</p>
								</div>
							</div>
						</div>
					)}
				</div>
			</main>

			{/* Input form */}
			<footer className="border-t border-gray-200 bg-white px-4 py-4">
				<div className="mx-auto max-w-3xl">
					{/**
					 * Message input form
					 *
					 * Simple form that calls sendMessage from the useChat hook.
					 * We manage the input state locally since useChat doesn't provide form helpers.
					 */}
					<form onSubmit={handleSubmit} className="flex gap-2">
						<input
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="Type your message..."
							disabled={isLoading}
							className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
						/>
						<button
							type="submit"
							disabled={isLoading || !input.trim()}
							className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
						>
							{isLoading ? "Sending..." : "Send"}
						</button>
					</form>
					<p className="mt-2 text-xs text-gray-500">
						Press Enter to send, or click the Send button
					</p>
				</div>
			</footer>
		</div>
	);
}
