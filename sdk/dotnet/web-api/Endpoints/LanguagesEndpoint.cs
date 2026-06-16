using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class LanguagesEndpoint
{
    public static void MapLanguagesEndpoint(this WebApplication app)
    {
        app.MapGet("/languages", Handle);
    }

    private static async Task<IResult> Handle(IConfiguration config, string? endpoint)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var listRequest = new LanguagesListRequest();

            if (!string.IsNullOrEmpty(endpoint) && Enum.TryParse<LanguagesListRequestEndpoint>(endpoint, true, out var parsed))
            {
                listRequest.Endpoint = parsed;
            }

            var languages = await client!.Languages.ListAsync(listRequest);

            return Results.Ok(new
            {
                languages,
                message = "List languages completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
