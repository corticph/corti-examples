using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class TokenEndpoint
{
    public static void MapTokenEndpoint(this WebApplication app)
    {
        app.MapGet("/token", HandleGetToken);
        app.MapGet("/token/cc", Handle);
        app.MapGet("/token/bearer", HandleBearer);
        app.MapGet("/token/ropc", HandleGetTokenRopc);
        app.MapGet("/token/ropc-client", HandleRopcClient);
        app.MapGet("/token/ropc-refresh", HandleRopcRefresh);
    }

    /// <summary>
    /// Exchange client credentials for a token and return the raw token response (access_token, expires_in, etc.).
    /// Optional query: scopes (comma-separated), e.g. ?scopes=api,read.
    /// </summary>
    private static async Task<IResult> HandleGetToken(IConfiguration config, string? scopes)
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

            var request = string.IsNullOrWhiteSpace(scopes)
                ? new OAuthTokenRequest { ClientId = cortiConfig.ClientId, ClientSecret = cortiConfig.ClientSecret }
                : new OAuthTokenRequestWithScopes
                {
                    ClientId = cortiConfig.ClientId,
                    ClientSecret = cortiConfig.ClientSecret,
                    Scopes = scopes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                };

            var tokenResponse = await auth.GetTokenAsync(request);
            return Results.Ok(tokenResponse);
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
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

    /// <summary>
    /// Exchange username/password for a token via ROPC (resource owner password credentials). Optional query: scopes (comma-separated).
    /// </summary>
    private static async Task<IResult> HandleGetTokenRopc(IConfiguration config, string? scopes)
    {
        if (!CortiHelpers.TryGetRopcConfig(config, out var ropcConfig, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var auth = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = ropcConfig!.TenantName,
                Environment = ropcConfig.Environment,
            });

            var request = string.IsNullOrWhiteSpace(scopes)
                ? new OAuthRopcTokenRequest
                {
                    ClientId = ropcConfig.ClientId,
                    Username = ropcConfig.Username,
                    Password = ropcConfig.Password,
                }
                : new OAuthRopcTokenRequestWithScopes
                {
                    ClientId = ropcConfig.ClientId,
                    Username = ropcConfig.Username,
                    Password = ropcConfig.Password,
                    Scopes = scopes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                };

            var tokenResponse = await auth.GetTokenAsync(request);
            return Results.Ok(tokenResponse);
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }

    /// <summary>
    /// Perform ROPC flow, then exchange the refresh token for a new access token and return that response.
    /// Demonstrates the refresh_token grant: first call returns a refresh token, second call uses it.
    /// </summary>
    private static async Task<IResult> HandleRopcRefresh(IConfiguration config)
    {
        if (!CortiHelpers.TryGetRopcConfig(config, out var ropcConfig, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var auth = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = ropcConfig!.TenantName,
                Environment = ropcConfig.Environment,
            });

            var ropcResponse = await auth.GetTokenAsync(new OAuthRopcTokenRequest
            {
                ClientId = ropcConfig.ClientId,
                Username = ropcConfig.Username,
                Password = ropcConfig.Password,
            });

            if (ropcResponse.RefreshToken is null)
            {
                return Results.BadRequest(new { error = "ROPC response did not include a refresh token." });
            }

            var refreshResponse = await auth.GetTokenAsync(new OAuthRefreshTokenRequest
            {
                ClientId = ropcConfig.ClientId,
                RefreshToken = ropcResponse.RefreshToken,
            });

            return Results.Ok(refreshResponse);
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }

    /// <summary>
    /// Create a Corti client with ROPC auth (from config/env) and call Facts.FactGroupsListAsync().
    /// </summary>
    private static async Task<IResult> HandleRopcClient(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClientRopc(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            await client!.Facts.FactGroupsListAsync();
            return Results.Ok(new { message = "Corti client (ROPC auth) called Facts.FactGroupsListAsync successfully." });
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }
}
