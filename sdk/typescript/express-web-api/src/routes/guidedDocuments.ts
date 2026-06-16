import type { Application, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { cortiErrorResponse, createCortiClient, sendCortiConfigError } from "../lib/corti.js";

const SAMPLE_CONTEXT =
  "Patient has trouble breathing and reports chest pain that started this morning.";

export function registerGuidedDocuments(app: Application): void {
  app.get("/guided-documents", asyncHandler(handle));
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

  const suffix = String(Date.now());

  try {
    const templates = await client.documents.templates.list({});
    const sections = await client.documents.sections.list({});

    const section = await client.documents.sections.create({
      name: `Example section ${suffix}`,
      generation: {
        heading: "Summary",
        instructions: {
          contentPrompt: "Summarise the provided context in one short paragraph.",
        },
        outputSchema: {
          type: "string",
        },
      },
    });

    const template = await client.documents.templates.create({
      name: `Example template ${suffix}`,
      generation: {
        instructions: {
          prompt: "Produce a brief clinical summary from the supplied context.",
        },
        sections: [{ sectionId: section.id }],
      },
    });

    const generatedFromTemplate = await client.documents.generate({
      outputLanguage: "en",
      templateRef: {
        templateId: template.id,
      },
      context: [
        {
          type: "text",
          text: SAMPLE_CONTEXT,
        },
      ],
    });

    const generatedFromDynamic = await client.documents.generate({
      outputLanguage: "en",
      context: [
        {
          type: "text",
          text: SAMPLE_CONTEXT,
        },
      ],
      dynamicTemplate: {
        name: `Inline template ${suffix}`,
        generation: {
          instructions: {
            prompt: "Produce a brief clinical summary from the supplied context.",
          },
          sections: [
            {
              heading: "Summary",
              instructions: {
                contentPrompt: "Summarise the provided context in one short paragraph.",
              },
              outputSchema: {
                type: "string",
              },
            },
          ],
        },
      },
    });

    await client.documents.templates.delete(template.id);
    await client.documents.sections.delete(section.id);

    res.json({
      listTemplateCount: templates.length,
      listSectionCount: sections.length,
      createdSection: section,
      createdTemplate: template,
      generatedFromTemplate,
      generatedFromDynamic,
      message:
        "List guided templates/sections, create, generate (template ref and dynamic), and cleanup completed successfully",
    });
  } catch (e) {
    cortiErrorResponse(e, res);
  }
}
