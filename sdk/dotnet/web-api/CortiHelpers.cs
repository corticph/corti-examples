using Corti;

namespace CortiApiExamples;

/// <summary>
/// Corti configuration from config/env (TenantName, ClientId, ClientSecret, Environment).
/// </summary>
public sealed record CortiConfig(
    string TenantName,
    string ClientId,
    string ClientSecret,
    string Environment);

/// <summary>
/// ROPC (resource owner password credentials) config: TenantName, ClientId, Username, Password, Environment.
/// </summary>
public sealed record RopcConfig(
    string TenantName,
    string ClientId,
    string Username,
    string Password,
    string Environment);

/// <summary>
/// Authorization code config: TenantName, dedicated ClientId, ClientSecret, RedirectUri, Environment.
/// </summary>
public sealed record AuthCodeConfig(
    string TenantName,
    string ClientId,
    string ClientSecret,
    string RedirectUri,
    string Environment);

/// <summary>
/// PKCE config: TenantName, dedicated ClientId, RedirectUri, Environment (no ClientSecret).
/// </summary>
public sealed record PkceConfig(
    string TenantName,
    string ClientId,
    string RedirectUri,
    string Environment);


/// <summary>
/// Shared helpers for Corti SDK example endpoints.
/// </summary>
public static class CortiHelpers
{
    private static readonly IResult CortiConfigError = Results.BadRequest(new
    {
        error = "Corti credentials required. Set Corti:TenantName, Corti:ClientId and Corti:ClientSecret (or CORTI__TENANTNAME, CORTI__CLIENTID, CORTI__CLIENTSECRET) in appsettings or environment.",
    });

    /// <summary>
    /// Reads Corti config from IConfiguration. Returns (config, null) on success, (null, errorResult) when required values are missing.
    /// </summary>
    public static bool TryGetCortiConfig(IConfiguration config, out CortiConfig? cortiConfig, out IResult errorResult)
    {
        ArgumentNullException.ThrowIfNull(config);

        var tenantName = config["Corti:TenantName"];
        var clientId = config["Corti:ClientId"];
        var clientSecret = config["Corti:ClientSecret"];

        if (string.IsNullOrEmpty(tenantName) || string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
        {
            cortiConfig = null;
            errorResult = CortiConfigError;
            return false;
        }

        var environment = config["Corti:Environment"] ?? "eu";

        cortiConfig = new CortiConfig(tenantName, clientId, clientSecret, environment);
        errorResult = null!;
        return true;
    }

    public static bool TryCreateCortiClient(
        IConfiguration config,
        out CortiClient? client,
        out IResult errorResult)
    {
        if (!TryGetCortiConfig(config, out var cortiConfig, out errorResult) || cortiConfig is null)
        {
            client = null;
            return false;
        }

        client = new CortiClient(
            cortiConfig.TenantName,
            cortiConfig.Environment,
            new CortiClientAuth.ClientCredentials(cortiConfig.ClientId, cortiConfig.ClientSecret));
        return true;
    }

    private static readonly IResult RopcConfigError = Results.BadRequest(new
    {
        error = "ROPC credentials required. Set Corti:TenantName, Corti:ClientId (or Corti:RopcClientId), Corti:Username and Corti:Password (or CORTI__TENANTNAME, CORTI__CLIENTID/CORTI__ROPCCLIENTID, CORTI__USERNAME, CORTI__PASSWORD) in appsettings or environment.",
    });

    /// <summary>
    /// Reads ROPC config from IConfiguration. Returns (config, null) on success, (null, errorResult) when required values are missing.
    /// Uses Corti:RopcClientId when set, otherwise Corti:ClientId (ROPC typically uses a different OAuth client than client credentials).
    /// </summary>
    public static bool TryGetRopcConfig(IConfiguration config, out RopcConfig? ropcConfig, out IResult errorResult)
    {
        ArgumentNullException.ThrowIfNull(config);

        var tenantName = config["Corti:TenantName"];
        var clientId = config["Corti:RopcClientId"] ?? config["Corti:ClientId"];
        var username = config["Corti:Username"];
        var password = config["Corti:Password"];

        if (string.IsNullOrEmpty(tenantName) || string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
        {
            ropcConfig = null;
            errorResult = RopcConfigError;
            return false;
        }

        var environment = config["Corti:Environment"] ?? "eu";

        ropcConfig = new RopcConfig(tenantName, clientId, username, password, environment);
        errorResult = null!;
        return true;
    }

    public static bool TryCreateCortiClientRopc(
        IConfiguration config,
        out CortiClient? client,
        out IResult errorResult)
    {
        if (!TryGetRopcConfig(config, out var ropcConfig, out errorResult) || ropcConfig is null)
        {
            client = null;
            return false;
        }

        client = new CortiClient(
            ropcConfig.TenantName,
            ropcConfig.Environment,
            new CortiClientAuth.Ropc(ropcConfig.ClientId, ropcConfig.Username, ropcConfig.Password));
        return true;
    }

    private static readonly IResult AuthCodeConfigError = Results.BadRequest(new
    {
        error = "Auth code credentials required. Set Corti:AuthCodeClientId, Corti:AuthCodeClientSecret, Corti:AuthCodeRedirectUri, and Corti:AuthCodeTenantName (or Corti:TenantName as fallback) in appsettings or environment.",
    });

    /// <summary>
    /// Reads authorization code config from IConfiguration. Uses dedicated keys for all fields (separate from CC and ROPC clients).
    /// Corti:AuthCodeTenantName is preferred; falls back to Corti:TenantName if not set.
    /// </summary>
    public static bool TryGetAuthCodeConfig(IConfiguration config, out AuthCodeConfig? authCodeConfig, out IResult errorResult)
    {
        ArgumentNullException.ThrowIfNull(config);

        var tenantName = config["Corti:AuthCodeTenantName"] ?? config["Corti:TenantName"];
        var clientId = config["Corti:AuthCodeClientId"];
        var clientSecret = config["Corti:AuthCodeClientSecret"];
        var redirectUri = config["Corti:AuthCodeRedirectUri"];

        if (string.IsNullOrEmpty(tenantName) || string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret) || string.IsNullOrEmpty(redirectUri))
        {
            authCodeConfig = null;
            errorResult = AuthCodeConfigError;
            return false;
        }

        var environment = config["Corti:AuthCodeEnvironment"] ?? config["Corti:Environment"] ?? "eu";

        authCodeConfig = new AuthCodeConfig(tenantName, clientId, clientSecret, redirectUri, environment);
        errorResult = null!;
        return true;
    }

    private static readonly IResult PkceConfigError = Results.BadRequest(new
    {
        error = "PKCE credentials required. Set Corti:PkceClientId, Corti:PkceRedirectUri, and Corti:PkceTenantName (or Corti:TenantName as fallback) in appsettings or environment.",
    });

    /// <summary>
    /// Reads PKCE config from IConfiguration. Uses dedicated keys for all fields (no client secret).
    /// Corti:PkceTenantName is preferred; falls back to Corti:TenantName if not set.
    /// </summary>
    public static bool TryGetPkceConfig(IConfiguration config, out PkceConfig? pkceConfig, out IResult errorResult)
    {
        ArgumentNullException.ThrowIfNull(config);

        var tenantName = config["Corti:PkceTenantName"] ?? config["Corti:TenantName"];
        var clientId = config["Corti:PkceClientId"];
        var redirectUri = config["Corti:PkceRedirectUri"];

        if (string.IsNullOrEmpty(tenantName) || string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(redirectUri))
        {
            pkceConfig = null;
            errorResult = PkceConfigError;
            return false;
        }

        var environment = config["Corti:PkceEnvironment"] ?? config["Corti:Environment"] ?? "eu";

        pkceConfig = new PkceConfig(tenantName, clientId, redirectUri, environment);
        errorResult = null!;
        return true;
    }

    public static string? ResolveSampleFilePath(string contentRootPath, string fileName)
    {
        var path = Path.Combine(contentRootPath, "sample", fileName);
        if (File.Exists(path))
        {
            return path;
        }

        path = Path.Combine(AppContext.BaseDirectory, "sample", fileName);
        return File.Exists(path) ? path : null;
    }

    public static InteractionsListRequestSort? ParseSort(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        return value.ToLowerInvariant() switch
        {
            "id" => InteractionsListRequestSort.Id,
            "assigneduserid" => InteractionsListRequestSort.AssignedUserId,
            "patient" => InteractionsListRequestSort.Patient,
            "createdat" => InteractionsListRequestSort.CreatedAt,
            "endedat" => InteractionsListRequestSort.EndedAt,
            "updatedat" => InteractionsListRequestSort.UpdatedAt,
            _ => InteractionsListRequestSort.FromCustom(value),
        };
    }

    public static CommonSortingDirectionEnum? ParseDirection(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        return value.ToLowerInvariant() switch
        {
            "asc" => CommonSortingDirectionEnum.Asc,
            "desc" => CommonSortingDirectionEnum.Desc,
            _ => CommonSortingDirectionEnum.FromCustom(value),
        };
    }

    public static IEnumerable<InteractionsEncounterStatusEnum>? ParseEncounterStatus(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        var status = value.ToLowerInvariant() switch
        {
            "planned" => InteractionsEncounterStatusEnum.Planned,
            "inprogress" => InteractionsEncounterStatusEnum.InProgress,
            "onhold" => InteractionsEncounterStatusEnum.OnHold,
            "completed" => InteractionsEncounterStatusEnum.Completed,
            "cancelled" => InteractionsEncounterStatusEnum.Cancelled,
            "deleted" => InteractionsEncounterStatusEnum.Deleted,
            _ => (InteractionsEncounterStatusEnum?)null,
        };
        return status is { } s ? new[] { s } : null;
    }

    /// <summary>
    /// Returns an IResult for Corti API errors (status code and body from the exception).
    /// </summary>
    public static IResult CortiApiErrorResult(CortiClientApiException ex)
    {
        ArgumentNullException.ThrowIfNull(ex);
        return Results.Json(
            new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
            statusCode: (int)ex.StatusCode);
    }
}
