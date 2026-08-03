import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerGuidedTemplates(app: Application): void {
  app.get("/documents/templates", asyncHandler(handle));
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
    // List existing guided templates
    const templates = await client.documents.templates.list();

    // Create a helper section first (templates reference sections by ID)
    const section = await client.documents.sections.create({
      name: "SDK Example – Assessment",
      description: "Assessment section for template demo",
      languages: ["en"],
      publish: true,
      generation: {
        heading: "Assessment",
        instructions: {
          contentPrompt: "Provide a clinical assessment based on the patient encounter.",
        },
        outputSchema: { type: "string" },
      },
    });

    // Create a guided template from scratch, referencing the section
    const createdTemplate = await client.documents.templates.create({
      name: "SDK Example – Consultation Note",
      description: "A simple consultation note template created by the SDK example",
      languages: ["en"],
      publish: true,
      generation: {
        instructions: {
          prompt: "Generate a structured consultation note.",
        },
        sections: [{ sectionId: section.id, orderIndex: 0 }],
      },
    });
    const templateId = createdTemplate.id;

    // Get the template by ID
    const retrievedTemplate = await client.documents.templates.get(templateId);

    // Update the template metadata
    const updatedTemplate = await client.documents.templates.update(templateId, {
      description: "Consultation note template (updated via SDK example)",
    });

    // List versions for this template
    const versions = await client.documents.templates.versions.list(templateId);

    // Clean up (template first, then section)
    await client.documents.templates.delete(templateId);
    await client.documents.sections.delete(section.id);

    res.json({
      listCount: templates.length,
      templates,
      createdTemplate,
      retrievedTemplate,
      updatedTemplate,
      versions,
      message:
        "List, create, get, update, list versions, delete guided template completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
