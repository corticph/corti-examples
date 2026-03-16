using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class TokenEndpoint
{
    public static void MapTokenEndpoint(this WebApplication app)
    {
        app.MapGet("/token", HandleGetToken);
        app.MapGet("/token/cc", HandleTokenCc);
        app.MapGet("/token/bearer", HandleBearer);
        app.MapGet("/token/ropc", HandleGetTokenRopc);
        app.MapGet("/token/ropc-client", HandleRopcClient);
        app.MapGet("/token/ropc-refresh", HandleRopcRefresh);
        app.MapGet("/token/custom-refresh", HandleCustomRefresh);
        app.MapGet("/token/auth-code-authorize", HandleGetTokenAuthCodeAuthorize);
        app.MapGet("/token/auth-code", HandleGetTokenAuthCode);
        app.MapGet("/token/pkce-authorize", HandleGetTokenPkceAuthorize);
        app.MapGet("/token/pkce", HandleGetTokenPkce);
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
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }

    /// <summary>
    /// Create a Corti client with client credentials (from config/env) and call a simple API with no parameters — Facts.FactGroupsListAsync().
    /// </summary>
    private static async Task<IResult> HandleTokenCc(IConfiguration config)
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
            return CortiHelpers.CortiApiErrorResult(ex);
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

            var client = new CortiClient(
                cortiConfig.TenantName,
                cortiConfig.Environment,
                new CortiClientAuth.Bearer(tokenResponse.AccessToken ?? string.Empty));

            var factGroups = await client.Facts.FactGroupsListAsync();
            return Results.Ok(new { message = "Corti client (Bearer token from CC) called Facts.FactGroupsListAsync successfully." });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
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
            return CortiHelpers.CortiApiErrorResult(ex);
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
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }

    /// <summary>
    /// Create a CortiClient with only a custom RefreshAccessToken delegate (no initial token).
    /// The delegate performs an ROPC flow to obtain a token — demonstrating that any arbitrary
    /// token source can be wired in. The client calls the delegate on the first API request.
    /// </summary>
    private static async Task<IResult> HandleCustomRefresh(IConfiguration config)
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

            var client = new CortiClient(
                ropcConfig.TenantName,
                ropcConfig.Environment,
                new CortiClientAuth.BearerCustomRefresh(
                    RefreshAccessToken: async (_, ct) =>
                    {
                        var r = await auth.GetTokenAsync(new OAuthRopcTokenRequest
                        {
                            ClientId = ropcConfig.ClientId,
                            Username = ropcConfig.Username,
                            Password = ropcConfig.Password,
                        }, cancellationToken: ct);
                        return new CustomRefreshResult
                        {
                            AccessToken = r.AccessToken,
                            ExpiresIn = r.ExpiresIn,
                            TokenType = r.TokenType,
                            RefreshToken = r.RefreshToken,
                            RefreshExpiresIn = r.RefreshExpiresIn,
                        };
                    }));

            await client.Facts.FactGroupsListAsync();
            return Results.Ok(new { message = "Corti client (custom RefreshAccessToken) called Facts.FactGroupsListAsync successfully." });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
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
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }

    /// <summary>
    /// Build and return the Keycloak authorization URL for the authorization code flow.
    /// The client should redirect the user to this URL to initiate login.
    /// Optional query param: redirectUri (overrides config default).
    /// </summary>
    private static async Task<IResult> HandleGetTokenAuthCodeAuthorize(IConfiguration config, string? redirectUri)
    {
        if (!CortiHelpers.TryGetAuthCodeConfig(config, out var authCodeConfig, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var auth = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = authCodeConfig!.TenantName,
                Environment = authCodeConfig.Environment,
            });

            var resolvedRedirectUri = redirectUri ?? authCodeConfig.RedirectUri;
            var url = await auth.AuthorizeUrlAsync(authCodeConfig.ClientId, resolvedRedirectUri);
            return Results.Ok(new { url });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }

    /// <summary>
    /// Exchange an authorization code for an access token (authorization_code grant).
    /// Required query param: code (the one-time code from the redirect).
    /// Optional query param: redirectUri (overrides config default).
    /// </summary>
    private static async Task<IResult> HandleGetTokenAuthCode(IConfiguration config, string? code, string? redirectUri)
    {
        if (!CortiHelpers.TryGetAuthCodeConfig(config, out var authCodeConfig, out var credentialError))
        {
            return credentialError;
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            return Results.BadRequest(new { error = "Missing required query parameter: code" });
        }

        try
        {
            var auth = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = authCodeConfig!.TenantName,
                Environment = authCodeConfig.Environment,
            });

            var resolvedRedirectUri = redirectUri ?? authCodeConfig.RedirectUri;
            var tokenResponse = await auth.GetTokenAsync(new OAuthAuthCodeTokenRequest
            {
                ClientId = authCodeConfig.ClientId,
                ClientSecret = authCodeConfig.ClientSecret,
                Code = code,
                RedirectUri = resolvedRedirectUri,
            });
            return Results.Ok(tokenResponse);
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }

    /// <summary>
    /// Build and return the Keycloak authorization URL for the PKCE flow (includes code_challenge).
    /// The client should redirect the user to this URL to initiate login.
    /// Required query param: codeChallenge (S256 — generated by the client from the code verifier).
    /// Optional query param: redirectUri (overrides config default).
    /// </summary>
    private static async Task<IResult> HandleGetTokenPkceAuthorize(IConfiguration config, string? codeChallenge, string? redirectUri)
    {
        if (!CortiHelpers.TryGetPkceConfig(config, out var pkceConfig, out var credentialError))
        {
            return credentialError;
        }

        if (string.IsNullOrWhiteSpace(codeChallenge))
        {
            return Results.BadRequest(new { error = "Missing required query parameter: codeChallenge" });
        }

        try
        {
            var auth = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = pkceConfig!.TenantName,
                Environment = pkceConfig.Environment,
            });

            var resolvedRedirectUri = redirectUri ?? pkceConfig.RedirectUri;
            var url = await auth.AuthorizeUrlAsync(pkceConfig.ClientId, resolvedRedirectUri, codeChallenge);
            return Results.Ok(new { url });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }

    /// <summary>
    /// Exchange a PKCE authorization code for an access token (authorization_code + code_verifier grant, no client secret).
    /// Required query params: code, codeVerifier.
    /// Optional query param: redirectUri (overrides config default).
    /// </summary>
    private static async Task<IResult> HandleGetTokenPkce(IConfiguration config, string? code, string? codeVerifier, string? redirectUri)
    {
        if (!CortiHelpers.TryGetPkceConfig(config, out var pkceConfig, out var credentialError))
        {
            return credentialError;
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            return Results.BadRequest(new { error = "Missing required query parameter: code" });
        }

        if (string.IsNullOrWhiteSpace(codeVerifier))
        {
            return Results.BadRequest(new { error = "Missing required query parameter: codeVerifier" });
        }

        try
        {
            var auth = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = pkceConfig!.TenantName,
                Environment = pkceConfig.Environment,
            });

            var resolvedRedirectUri = redirectUri ?? pkceConfig.RedirectUri;
            var tokenResponse = await auth.GetTokenAsync(new OAuthPkceTokenRequest
            {
                ClientId = pkceConfig.ClientId,
                Code = code,
                RedirectUri = resolvedRedirectUri,
                CodeVerifier = codeVerifier,
            });
            return Results.Ok(tokenResponse);
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
