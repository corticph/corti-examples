using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class ClientVariantsEndpoint
{
    public static void MapClientVariantsEndpoint(this WebApplication app)
    {
        app.MapGet("/client-variants", HandleClientVariants);
    }

    private static async Task<IResult> HandleClientVariants(IConfiguration config)
    {
        var hasCc = CortiHelpers.TryGetCortiConfig(config, out var cc, out _);
        var hasRopc = CortiHelpers.TryGetRopcConfig(config, out var ropc, out _);
        var results = new List<object>();

        async Task Run(string name, Func<Task<CortiClient>> factory, bool expectedError = false)
        {
            try
            {
                var c = await factory();
                await c.Facts.FactGroupsListAsync();
                results.Add(expectedError
                    ? new { name, status = "ok", expectedError = true }
                    : (object)new { name, status = "ok" });
            }
            catch (Exception ex)
            {
                results.Add(expectedError
                    ? new { name, status = "error", message = ex.Message, expectedError = true }
                    : (object)new { name, status = "error", message = ex.Message });
            }
        }

        // 1. CC — explicit tenant + env (string)
        if (hasCc)
            await Run("cc-explicit", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(
                    cc!.TenantName,
                    cc.Environment,
                    new CortiClientAuth.ClientCredentials(cc.ClientId, cc.ClientSecret));
            });
        else
            results.Add(new { name = "cc-explicit", status = "skipped" });

        // 2. ROPC — explicit tenant + env
        if (hasRopc)
            await Run("ropc-explicit", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(
                    ropc!.TenantName,
                    ropc.Environment,
                    new CortiClientAuth.Ropc(ropc.ClientId, ropc.Username, ropc.Password));
            });
        else
            results.Add(new { name = "ropc-explicit", status = "skipped" });

        // 3. CC — environment as library constant (CortiClientEnvironment.Eu)
        if (hasCc)
            await Run("cc-env-library", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(
                    cc!.TenantName,
                    CortiClientEnvironment.Us,
                    new CortiClientAuth.ClientCredentials(cc.ClientId, cc.ClientSecret));
            });
        else
            results.Add(new { name = "cc-env-library", status = "skipped" });

        // 4. CC — custom environment URLs object (CortiClientEnvironment with explicit URLs)
        if (hasCc)
            await Run("cc-env-custom-urls", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(
                    cc!.TenantName,
                    new CortiClientEnvironment
                    {
                        Base = $"https://api.{cc.Environment}.corti.app/v2",
                        Wss = $"wss://api.{cc.Environment}.corti.app/audio-bridge/v2",
                        Login = $"https://auth.{cc.Environment}.corti.app/realms",
                        Agents = $"https://api.{cc.Environment}.corti.app",
                    },
                    new CortiClientAuth.ClientCredentials(cc.ClientId, cc.ClientSecret));
            });
        else
            results.Add(new { name = "cc-env-custom-urls", status = "skipped" });

        // 5. Proxy / passthrough — custom environment URLs, no auth, no tenant name.
        //    A 401 response from the API is expected here: the client is constructed successfully (the SDK
        //    does not require credentials at construction time), but every request will be rejected by the
        //    server because no Authorization header is sent.
        if (hasCc)
            await Run("env-custom-urls-no-auth", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(new CortiClientEnvironment
                {
                    Base = $"https://api.{cc!.Environment}.corti.app/v2",
                    Wss = $"wss://api.{cc.Environment}.corti.app/audio-bridge/v2",
                    Login = $"https://auth.{cc.Environment}.corti.app/realms",
                    Agents = $"https://api.{cc.Environment}.corti.app",
                });
            }, expectedError: true);
        else
            results.Add(new { name = "env-custom-urls-no-auth", status = "skipped" });

        if (hasCc)
        {
            var authClient = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = cc!.TenantName,
                Environment = cc.Environment,
            });
            var tokenResponse = await authClient.GetTokenAsync(new OAuthTokenRequest
            {
                ClientId = cc.ClientId,
                ClientSecret = cc.ClientSecret,
            });
            var accessToken = tokenResponse.AccessToken ?? string.Empty;

            // 6. Bearer — explicit tenant + env
            await Run("bearer-explicit", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(
                    cc.TenantName,
                    cc.Environment,
                    new CortiClientAuth.Bearer(accessToken));
            });

            // 7. Bearer — auto-derive tenant + env from JWT
            await Run("bearer-auto-derive", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(new CortiClientAuth.Bearer(accessToken));
            });

            // 8. Bearer — explicit + custom refreshAccessToken (AccessToken is primary; fn called on expiry)
            await Run("bearer-with-refresh-fn", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(
                    cc.TenantName,
                    cc.Environment,
                    new CortiClientAuth.Bearer(
                        AccessToken: accessToken,
                        RefreshAccessToken: async (_, ct) =>
                        {
                            var r = await authClient.GetTokenAsync(
                                new OAuthTokenRequest { ClientId = cc.ClientId, ClientSecret = cc.ClientSecret },
                                cancellationToken: ct);
                            return new CustomRefreshResult { AccessToken = r.AccessToken, ExpiresIn = r.ExpiresIn, TokenType = r.TokenType };
                        }));
            });

            // 9. BearerCustomRefresh — refreshAccessToken as primary, seeded with initial accessToken
            //    The seeded AccessToken/ExpiresIn prevent an immediate refresh call on the first API request.
            await Run("bearer-custom-refresh-seeded", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(
                    cc.TenantName,
                    cc.Environment,
                    new CortiClientAuth.BearerCustomRefresh(
                        RefreshAccessToken: async (_, ct) =>
                        {
                            var r = await authClient.GetTokenAsync(
                                new OAuthTokenRequest { ClientId = cc.ClientId, ClientSecret = cc.ClientSecret },
                                cancellationToken: ct);
                            return new CustomRefreshResult { AccessToken = r.AccessToken, ExpiresIn = r.ExpiresIn, TokenType = r.TokenType };
                        },
                        AccessToken: accessToken,
                        ExpiresIn: tokenResponse.ExpiresIn));
            });
        }
        else
        {
            results.Add(new { name = "bearer-explicit", status = "skipped" });
            results.Add(new { name = "bearer-auto-derive", status = "skipped" });
            results.Add(new { name = "bearer-with-refresh-fn", status = "skipped" });
            results.Add(new { name = "bearer-custom-refresh-seeded", status = "skipped" });
        }

        if (hasRopc)
        {
            var ropcAuth = CustomAuthClient.Create(new CortiAuthClientOptions
            {
                TenantName = ropc!.TenantName,
                Environment = ropc.Environment,
            });

            Func<string?, CancellationToken, Task<CustomRefreshResult>> getRopcToken = async (_, ct) =>
            {
                var r = await ropcAuth.GetTokenAsync(
                    new OAuthRopcTokenRequest { ClientId = ropc.ClientId, Username = ropc.Username, Password = ropc.Password },
                    cancellationToken: ct);
                return new CustomRefreshResult { AccessToken = r.AccessToken, ExpiresIn = r.ExpiresIn, TokenType = r.TokenType, RefreshToken = r.RefreshToken };
            };

            // 10. BearerCustomRefresh — explicit tenant + env
            await Run("refresh-fn-explicit", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(
                    ropc.TenantName,
                    ropc.Environment,
                    new CortiClientAuth.BearerCustomRefresh(RefreshAccessToken: getRopcToken));
            });

            // 11. BearerCustomRefresh — auto-derive tenant + env from JWT
            await Run("refresh-fn-auto-derive", async () =>
            {
                await Task.CompletedTask;
                return new CortiClient(new CortiClientAuth.BearerCustomRefresh(RefreshAccessToken: getRopcToken));
            });

            // 12. Bearer with built-in refresh (AccessToken + ClientId + RefreshToken — SDK calls refresh_token grant on expiry)
            //     ROPC is used here because client_credentials flows don't return a refresh token.
            var ropcTokenForRefresh = await ropcAuth.GetTokenAsync(
                new OAuthRopcTokenRequest { ClientId = ropc.ClientId, Username = ropc.Username, Password = ropc.Password });
            if (ropcTokenForRefresh.RefreshToken != null)
                await Run("bearer-with-builtin-refresh", async () =>
                {
                    await Task.CompletedTask;
                    return new CortiClient(
                        ropc.TenantName,
                        ropc.Environment,
                        new CortiClientAuth.Bearer(
                            AccessToken: ropcTokenForRefresh.AccessToken ?? string.Empty,
                            ClientId: ropc.ClientId,
                            RefreshToken: ropcTokenForRefresh.RefreshToken,
                            ExpiresIn: ropcTokenForRefresh.ExpiresIn,
                            RefreshExpiresIn: ropcTokenForRefresh.RefreshExpiresIn));
                });
            else
                results.Add(new { name = "bearer-with-builtin-refresh", status = "skipped", message = "ROPC response did not include a refresh token" });
        }
        else
        {
            results.Add(new { name = "refresh-fn-explicit", status = "skipped" });
            results.Add(new { name = "refresh-fn-auto-derive", status = "skipped" });
            results.Add(new { name = "bearer-with-builtin-refresh", status = "skipped" });
        }

        return Results.Ok(new { variants = results });
    }
}
