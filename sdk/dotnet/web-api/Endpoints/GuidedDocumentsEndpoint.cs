using Corti;
using Corti.Documents;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class GuidedDocumentsEndpoint
{
    private const string SampleContext =
        "Patient has trouble breathing and reports chest pain that started this morning.";

    public static void MapGuidedDocumentsEndpoint(this WebApplication app)
    {
        app.MapGet("/guided-documents", Handle);
    }

    private static async Task<IResult> Handle(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        var suffix = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();

        try
        {
            var templates = (await client!.Documents.Templates.ListAsync(new GuidedTemplatesListRequest())).ToList();
            var sections = (await client.Documents.Sections.ListAsync(new GuidedSectionsListRequest())).ToList();

            var section = await client.Documents.Sections.CreateAsync(new GuidedSectionsCreateFromScratchRequest
            {
                Name = $"Example section {suffix}",
                Generation = new GuidedSectionGeneration
                {
                    Heading = "Summary",
                    Instructions = new GuidedSectionInstructions
                    {
                        ContentPrompt = "Summarise the provided context in one short paragraph.",
                    },
                    OutputSchema = new GuidedStringNode(),
                },
            });

            var template = await client.Documents.Templates.CreateAsync(new GuidedTemplatesCreateFromScratchRequest
            {
                Name = $"Example template {suffix}",
                Generation = new GuidedTemplatesCreateFromScratchRequestGeneration
                {
                    Instructions = new GuidedTemplateInstructions
                    {
                        Prompt = "Produce a brief clinical summary from the supplied context.",
                    },
                    Sections = [new GuidedTemplatesVersionSectionRequest { SectionId = section.Id }],
                },
            });

            var generatedFromTemplate = await client.Documents.GenerateAsync(new GuidedDocumentsGenerateByTemplateRef
            {
                OutputLanguage = "en",
                TemplateRef = new GuidedTemplateRef { TemplateId = template.Id },
                Context =
                [
                    new CommonTextContext
                    {
                        Type = new CommonTextContext.TypeLiteral(),
                        Text = SampleContext,
                    },
                ],
            });

            var generatedFromDynamic = await client.Documents.GenerateAsync(new GuidedDocumentsGenerateByDynamic
            {
                OutputLanguage = "en",
                Context =
                [
                    new CommonTextContext
                    {
                        Type = new CommonTextContext.TypeLiteral(),
                        Text = SampleContext,
                    },
                ],
                DynamicTemplate = new GuidedDynamicRequest
                {
                    Name = $"Inline template {suffix}",
                    Generation = new GuidedDynamicInline
                    {
                        Instructions = new GuidedTemplateInstructions
                        {
                            Prompt = "Produce a brief clinical summary from the supplied context.",
                        },
                        Sections =
                        [
                            new GuidedSectionGeneration
                            {
                                Heading = "Summary",
                                Instructions = new GuidedSectionInstructions
                                {
                                    ContentPrompt = "Summarise the provided context in one short paragraph.",
                                },
                                OutputSchema = new GuidedStringNode(),
                            },
                        ],
                    },
                },
            });

            await client.Documents.Templates.DeleteAsync(template.Id);
            await client.Documents.Sections.DeleteAsync(section.Id);

            return Results.Ok(new
            {
                listTemplateCount = templates.Count,
                listSectionCount = sections.Count,
                createdSection = section,
                createdTemplate = template,
                generatedFromTemplate,
                generatedFromDynamic,
                message =
                    "List guided templates/sections, create, generate (template ref and dynamic), and cleanup completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
