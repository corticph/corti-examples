using Corti;
using Corti.Documents;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class GuidedTemplatesEndpoint
{
    public static void MapGuidedTemplatesEndpoint(this WebApplication app)
    {
        app.MapGet("/documents/templates", Handle);
    }

    private static async Task<IResult> Handle(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            // List existing guided templates
            var listResponse = await client!.Documents.Templates.ListAsync(new GuidedTemplatesListRequest());
            var templates = listResponse?.ToList() ?? new List<GuidedTemplateListItem>();

            // Create a helper section first (templates reference sections by ID)
            var section = await client.Documents.Sections.CreateAsync(
                GuidedSectionsCreateRequest.FromGuidedSectionsCreateFromScratchRequest(
                    new GuidedSectionsCreateFromScratchRequest
                    {
                        Name = "SDK Example – Assessment",
                        Description = "Assessment section for template demo",
                        Languages = ["en"],
                        Publish = true,
                        Generation = new GuidedSectionGeneration
                        {
                            Heading = "Assessment",
                            Instructions = new GuidedSectionInstructions
                            {
                                ContentPrompt = "Provide a clinical assessment based on the patient encounter.",
                            },
                            OutputSchema = GuidedOutputSchema.FromGuidedStringNode(new GuidedStringNode()),
                        },
                    }));

            // Create a guided template from scratch, referencing the section
            var createdTemplate = await client.Documents.Templates.CreateAsync(
                GuidedTemplatesCreateRequest.FromGuidedTemplatesCreateFromScratchRequest(
                    new GuidedTemplatesCreateFromScratchRequest
                    {
                        Name = "SDK Example – Consultation Note",
                        Description = "A simple consultation note template created by the SDK example",
                        Languages = ["en"],
                        Publish = true,
                        Generation = new GuidedTemplatesCreateFromScratchRequestGeneration
                        {
                            Instructions = new GuidedTemplateInstructions
                            {
                                Prompt = "Generate a structured consultation note.",
                            },
                            Sections = [new GuidedTemplatesVersionSectionRequest { SectionId = section.Id, OrderIndex = 0 }],
                        },
                    }));
            var templateId = createdTemplate.Id;

            // Get the template by ID
            var retrievedTemplate = await client.Documents.Templates.GetAsync(templateId);

            // Update the template metadata
            var updatedTemplate = await client.Documents.Templates.UpdateAsync(templateId, new GuidedTemplatesUpdateRequest
            {
                Description = "Consultation note template (updated via SDK example)",
            });

            // List versions for this template
            var versions = await client.Documents.Templates.Versions.ListAsync(templateId);

            // Clean up (template first, then section)
            await client.Documents.Templates.DeleteAsync(templateId);
            await client.Documents.Sections.DeleteAsync(section.Id);

            return Results.Ok(new
            {
                listCount = templates.Count,
                templates,
                createdTemplate,
                retrievedTemplate,
                updatedTemplate,
                versions,
                message = "List, create, get, update, list versions, delete guided template completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
