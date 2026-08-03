import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

export function registerGuidedSections(app: Application): void {
  app.get("/documents/sections", asyncHandler(handle));
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
    // List existing guided sections
    const sections = await client.documents.sections.list();

    // Create a guided section from scratch
    const createdSection = await client.documents.sections.create({
      name: "SDK Example – Chief Complaint",
      description: "Summarises the patient's chief complaint",
      languages: ["en"],
      publish: true,
      generation: {
        heading: "Chief Complaint",
        instructions: {
          contentPrompt:
            "Summarise the patient's primary reason for the visit in one or two sentences.",
        },
        outputSchema: { type: "string" },
      },
    });
    const sectionId = createdSection.id;

    // Get the section by ID
    const retrievedSection = await client.documents.sections.get(sectionId);

    // Update the section metadata
    const updatedSection = await client.documents.sections.update(sectionId, {
      description: "Summarises the patient's chief complaint (updated via SDK example)",
    });

    // List versions for this section
    const versions = await client.documents.sections.versions.list(sectionId);

    // Clean up
    await client.documents.sections.delete(sectionId);

    res.json({
      listCount: sections.length,
      sections,
      createdSection,
      retrievedSection,
      updatedSection,
      versions,
      message:
        "List, create, get, update, list versions, delete guided section completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
