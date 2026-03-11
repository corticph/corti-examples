using Corti;

namespace CortiApiExamples;

/// <summary>
/// Corti configuration from config/env (TenantName, ClientId, ClientSecret, Environment).
/// </summary>
public sealed record CortiConfig(
    string TenantName,
    string ClientId,
    string ClientSecret,
    CortiClientEnvironment Environment);

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

        var environment = string.Equals(config["Corti:Environment"], "us", StringComparison.OrdinalIgnoreCase)
            ? CortiClientEnvironment.Us
            : CortiClientEnvironment.Eu;

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

        client = new CortiClient(new CortiClientOptions
        {
            TenantName = cortiConfig.TenantName,
            Environment = cortiConfig.Environment,
            Auth = new CortiClientAuth.ClientCredentials(cortiConfig.ClientId, cortiConfig.ClientSecret),
        });
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
}
