using Corti;
using Corti.Documents;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class GuidedSectionsEndpoint
{
    public static void MapGuidedSectionsEndpoint(this WebApplication app)
    {
        app.MapGet("/documents/sections", Handle);
    }

    private static async Task<IResult> Handle(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            // List existing guided sections
            var listResponse = await client!.Documents.Sections.ListAsync(new GuidedSectionsListRequest());
            var sections = listResponse?.ToList() ?? new List<GuidedSectionListItem>();

            // Create a guided section from scratch
            var createdSection = await client.Documents.Sections.CreateAsync(
                GuidedSectionsCreateRequest.FromGuidedSectionsCreateFromScratchRequest(
                    new GuidedSectionsCreateFromScratchRequest
                    {
                        Name = "SDK Example – Chief Complaint",
                        Description = "Summarises the patient's chief complaint",
                        Languages = ["en"],
                        Publish = true,
                        Generation = new GuidedSectionGeneration
                        {
                            Heading = "Chief Complaint",
                            Instructions = new GuidedSectionInstructions
                            {
                                ContentPrompt = "Summarise the patient's primary reason for the visit in one or two sentences.",
                            },
                            OutputSchema = GuidedOutputSchema.FromGuidedStringNode(new GuidedStringNode()),
                        },
                    }));
            var sectionId = createdSection.Id;

            // Get the section by ID
            var retrievedSection = await client.Documents.Sections.GetAsync(sectionId);

            // Update the section metadata
            var updatedSection = await client.Documents.Sections.UpdateAsync(sectionId, new GuidedSectionsUpdateRequest
            {
                Description = "Summarises the patient's chief complaint (updated via SDK example)",
            });

            // List versions for this section
            var versions = await client.Documents.Sections.Versions.ListAsync(sectionId);

            // Clean up
            await client.Documents.Sections.DeleteAsync(sectionId);

            return Results.Ok(new
            {
                listCount = sections.Count,
                sections,
                createdSection,
                retrievedSection,
                updatedSection,
                versions,
                message = "List, create, get, update, list versions, delete guided section completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
