using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class TokenEndpoint
{
    public static void MapTokenEndpoint(this WebApplication app)
    {
        app.MapGet("/token", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        string? clientId,
        string? clientSecret,
        string? scope,
        string? code,
        string? redirectUri,
        string? codeVerifier,
        string? username,
        string? password,
        string? refreshToken)
    {
        if (string.IsNullOrEmpty(clientId))
        {
            return Results.BadRequest(new { error = "Missing required query parameter: clientId" });
        }

        var isPkce = !string.IsNullOrEmpty(code) && !string.IsNullOrEmpty(redirectUri) && !string.IsNullOrEmpty(codeVerifier);
        var isAuthorizationCode = !isPkce && !string.IsNullOrEmpty(code) && !string.IsNullOrEmpty(redirectUri);
        var isRopc = !string.IsNullOrEmpty(username) && !string.IsNullOrEmpty(password);
        var isRefresh = !string.IsNullOrEmpty(refreshToken);

        if (isPkce)
        {
            // PKCE: no client secret required
        }
        else if (isAuthorizationCode)
        {
            if (string.IsNullOrEmpty(clientSecret))
            {
                return Results.BadRequest(new { error = "Missing required query parameter: clientSecret for authorization_code flow" });
            }
        }
        else if (isRopc)
        {
            // ROPC: no client secret required
        }
        else if (isRefresh)
        {
            // Refresh: clientSecret optional (e.g. for confidential clients)
        }
        else
        {
            if (string.IsNullOrEmpty(clientSecret))
            {
                return Results.BadRequest(new { error = "Missing required query parameter: clientSecret" });
            }
        }

        if (!CortiHelpers.TryCreateCortiClientForAuth(config, out var client, out var credentialError))
        {
            return credentialError!;
        }

        try
        {
            var tenantName = config["Corti:TenantName"]!;
            var scopeValue = string.IsNullOrEmpty(scope) ? "openid" : scope;

            var request = isPkce
                ? AuthTokenRequest.FromAuthTokenRequestAuthorizationPkce(
                    new AuthTokenRequestAuthorizationPkce
                    {
                        ClientId = clientId,
                        RedirectUri = redirectUri!,
                        Code = code!,
                        CodeVerifier = codeVerifier!,
                        Scope = string.IsNullOrEmpty(scopeValue) ? null : scopeValue,
                    })
                : isAuthorizationCode
                    ? AuthTokenRequest.FromAuthTokenRequestAuthorizationCode(
                        new AuthTokenRequestAuthorizationCode
                        {
                            ClientId = clientId,
                            ClientSecret = clientSecret!,
                            RedirectUri = redirectUri!,
                            Code = code!,
                            Scope = string.IsNullOrEmpty(scopeValue) ? null : scopeValue,
                        })
                    : isRopc
                        ? AuthTokenRequest.FromAuthTokenRequestRopc(
                            new AuthTokenRequestRopc
                            {
                                ClientId = clientId,
                                Username = username!,
                                Password = password!,
                                Scope = string.IsNullOrEmpty(scopeValue) ? null : scopeValue,
                            })
                        : isRefresh
                            ? AuthTokenRequest.FromAuthTokenRequestRefresh(
                                new AuthTokenRequestRefresh
                                {
                                    ClientId = clientId,
                                    RefreshToken = refreshToken!,
                                    ClientSecret = string.IsNullOrEmpty(clientSecret) ? null : clientSecret,
                                    Scope = string.IsNullOrEmpty(scopeValue) ? null : scopeValue,
                                })
                            : AuthTokenRequest.FromAuthTokenRequestClientCredentials(
                                new AuthTokenRequestClientCredentials
                                {
                                    ClientId = clientId,
                                    ClientSecret = clientSecret!,
                                    Scope = scopeValue,
                                });

            var response = await client!.Auth.TokenAsync(tenantName, request);

            return Results.Ok(response);
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }
}
