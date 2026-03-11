using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class TokenEndpoint
{
    public static void MapTokenEndpoint(this WebApplication app)
    {
        app.MapGet("/token/cc", Handle);
        app.MapGet("/token/bearer", HandleBearer);
    }

    /// <summary>
    /// Create a Corti client with client credentials (from config/env) and call a simple API with no parameters — Facts.FactGroupsListAsync().
    /// </summary>
    private static async Task<IResult> Handle(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var factGroups = await client!.Facts.FactGroupsListAsync();
            return Results.Ok(new { message = "Corti client (client credentials) called Facts.FactGroupsListAsync successfully." });
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }

    /// <summary>
    /// Get a token via CustomAuthClient (client credentials), create a Corti client with Bearer token, then call Facts.FactGroupsListAsync() (no parameters).
    /// </summary>
    private static async Task<IResult> HandleBearer(IConfiguration config)
    {
        if (!CortiHelpers.TryGetCortiConfig(config, out var cortiConfig, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var auth = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = cortiConfig!.TenantName,
                Environment = cortiConfig.Environment,
            });
            var tokenResponse = await auth.GetTokenAsync(new OAuthTokenRequest { ClientId = cortiConfig.ClientId, ClientSecret = cortiConfig.ClientSecret });

            var client = new CortiClient(new CortiClientOptions
            {
                TenantName = cortiConfig.TenantName,
                Environment = cortiConfig.Environment,
                Auth = new CortiClientAuth.Bearer(tokenResponse.AccessToken ?? string.Empty),
            });

            var factGroups = await client.Facts.FactGroupsListAsync();
            return Results.Ok(new { message = "Corti client (Bearer token from CC) called Facts.FactGroupsListAsync successfully." });
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }
}
