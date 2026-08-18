using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class GuidedDocumentsEndpoint
{
    public static void MapGuidedDocumentsEndpoint(this WebApplication app)
    {
        app.MapGet("/documents/generate", Handle);
    }

    private static async Task<IResult> Handle(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            // 1. Create a section and template to generate from
            var section = await client!.Documents.Sections.CreateAsync(
                GuidedSectionsCreateRequest.FromGuidedSectionsCreateFromScratchRequest(
                    new GuidedSectionsCreateFromScratchRequest
                    {
                        Name = "SDK Example – HPI",
                        Description = "History of present illness for document generation demo",
                        Languages = ["en"],
                        Publish = true,
                        Generation = new GuidedSectionGeneration
                        {
                            Heading = "History of Present Illness",
                            Instructions = new GuidedSectionInstructions
                            {
                                ContentPrompt = "Summarise the history of the patient's present illness.",
                            },
                            OutputSchema = GuidedOutputSchema.FromGuidedStringNode(new GuidedStringNode()),
                        },
                    }));

            var template = await client.Documents.Templates.CreateAsync(
                GuidedTemplatesCreateRequest.FromGuidedTemplatesCreateFromScratchRequest(
                    new GuidedTemplatesCreateFromScratchRequest
                    {
                        Name = "SDK Example – Generate Demo Template",
                        Description = "Template used by the guided documents generation example",
                        Languages = ["en"],
                        Publish = true,
                        Generation = new GuidedTemplatesCreateFromScratchRequestGeneration
                        {
                            Instructions = new GuidedTemplateInstructions
                            {
                                Prompt = "Generate a clinical note from the encounter context.",
                            },
                            Sections = [new GuidedTemplatesVersionSectionRequest { SectionId = section.Id, OrderIndex = 0 }],
                        },
                    }));

            // 2. Generate an ephemeral document using the template and inline text context
            var generateResponse = await client.Documents.GenerateAsync(
                GuidedDocumentsGenerateRequest.FromGuidedDocumentsGenerateByTemplateRef(
                    new GuidedDocumentsGenerateByTemplateRef
                    {
                        TemplateRef = new GuidedTemplateRef { TemplateId = template.Id },
                        OutputLanguage = "en",
                        Context =
                        [
                            GuidedDocumentContext.FromCommonTextContext(new CommonTextContext
                            {
                                Type = new CommonTextContext.TypeLiteral(),
                                Text = "Patient is a 45-year-old male presenting with a 3-day history of progressive shortness of breath and dry cough. "
                                     + "No fever. Past medical history includes well-controlled hypertension. Non-smoker.",
                            }),
                        ],
                    }));

            var listed = (await client.Documents.ListAsync(new GuidedDocumentsListRequest())).ToList();
            GuidedDocument? retrieved = listed.Count > 0
                ? await client.Documents.GetAsync(listed[0].Id)
                : null;

            // 3. Clean up
            await client.Documents.Templates.DeleteAsync(template.Id);
            await client.Documents.Sections.DeleteAsync(section.Id);

            return Results.Ok(new
            {
                templateId = template.Id,
                sectionId = section.Id,
                generatedDocument = generateResponse.Document,
                sections = generateResponse.Document.Sections,
                usageInfo = generateResponse.UsageInfo,
                listCount = listed.Count,
                listed,
                retrieved,
                message = "Create section, create template, generate (ephemeral), list/get persisted guided documents, and cleanup completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
