using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class GuidedDocumentsCrudEndpoint
{
    public static void MapGuidedDocumentsCrudEndpoint(this WebApplication app)
    {
        app.MapGet("/documents/guided", Handle);
    }

    private static async Task<IResult> Handle(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var listed = (await client!.Documents.ListAsync(new GuidedDocumentsListRequest())).ToList();
            GuidedDocument? retrieved = null;
            if (listed.Count > 0)
            {
                retrieved = await client.Documents.GetAsync(listed[0].Id);
            }

            return Results.Ok(new
            {
                listCount = listed.Count,
                listed,
                retrieved,
                sections = retrieved?.Sections ?? listed.FirstOrDefault()?.Sections,
                message = "Guided documents list (GET /documents/); get first persisted document if any. Generate stays ephemeral on /documents/generate.",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
