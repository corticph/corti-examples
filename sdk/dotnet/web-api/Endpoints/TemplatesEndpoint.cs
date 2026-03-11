using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class TemplatesEndpoint
{
    public static void MapTemplatesEndpoint(this WebApplication app)
    {
        app.MapGet("/templates", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        string? org,
        string? lang,
        string? status)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var listRequest = new TemplatesListRequest();
            if (!string.IsNullOrEmpty(org))
            {
                listRequest.Org = [org];
            }
            if (!string.IsNullOrEmpty(lang))
            {
                listRequest.Lang = [lang];
            }
            if (!string.IsNullOrEmpty(status))
            {
                listRequest.Status = [status];
            }

            var sectionListRequest = new TemplatesSectionListRequest();
            if (!string.IsNullOrEmpty(org))
            {
                sectionListRequest.Org = [org];
            }
            if (!string.IsNullOrEmpty(lang))
            {
                sectionListRequest.Lang = [lang];
            }

            var listResponse = await client!.Templates.ListAsync(listRequest);
            var sectionListResponse = await client.Templates.SectionListAsync(sectionListRequest);
            var templates = listResponse.Data?.ToList() ?? new List<TemplatesItem>();

            TemplatesItem? templateByKey = null;
            if (templates.Count > 0 && !string.IsNullOrEmpty(templates[0].Key))
            {
                templateByKey = await client.Templates.GetAsync(templates[0].Key);
            }

            return Results.Ok(new
            {
                listCount = templates.Count,
                templates,
                sectionListCount = sectionListResponse.Data?.Count() ?? 0,
                sections = sectionListResponse.Data?.ToList() ?? new List<TemplatesSection>(),
                templateByKey,
                message = "List templates, list sections, and get by key completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }
}
