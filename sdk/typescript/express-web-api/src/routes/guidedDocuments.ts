import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
	cortiErrorResponse,
	createCortiClient,
	sendCortiConfigError,
} from "../lib/corti.js";

export function registerGuidedDocuments(app: Application): void {
	app.get("/documents/generate", asyncHandler(handle));
}

async function handle(_req: Request, res: Response): Promise<void> {
	if (sendCortiConfigError(res)) {
		return;
	}

	const { client } = createCortiClient();

	if (!client) {
		res.status(500).json({ error: "Missing client" });

		return;
	}

	try {
		// 1. Create a section and template to generate from
		const section = await client.documents.sections.create({
			name: "SDK Example – HPI",
			description: "History of present illness for document generation demo",
			languages: ["en"],
			publish: true,
			generation: {
				heading: "History of Present Illness",
				instructions: {
					contentPrompt:
						"Summarise the history of the patient's present illness.",
				},
				outputSchema: { type: "string" },
			},
		});

		const template = await client.documents.templates.create({
			name: "SDK Example – Generate Demo Template",
			description: "Template used by the guided documents generation example",
			languages: ["en"],
			publish: true,
			generation: {
				instructions: {
					prompt: "Generate a clinical note from the encounter context.",
				},
				sections: [{ sectionId: section.id, orderIndex: 0 }],
			},
		});

		// 2. Generate an ephemeral document using the template and inline text context
		const generateResponse = await client.documents.generate({
			templateRef: { templateId: template.id },
			outputLanguage: "en",
			context: [
				{
					type: "text",
					text:
						"Patient is a 45-year-old male presenting with a 3-day history of progressive shortness of breath and dry cough. " +
						"No fever. Past medical history includes well-controlled hypertension. Non-smoker.",
				},
			],
		});

		// 3. Clean up
		await client.documents.templates.delete(template.id);
		await client.documents.sections.delete(section.id);

		res.json({
			templateId: template.id,
			sectionId: section.id,
			generatedDocument: generateResponse.document,
			usageInfo: generateResponse.usageInfo,
			message:
				"Create section, create template, generate document, and cleanup completed successfully",
		});
	} catch (e) {
		cortiErrorResponse(e, res);
	}
}
