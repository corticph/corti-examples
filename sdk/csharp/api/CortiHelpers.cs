using CortiApi;

namespace CortiApiExamples;

/// <summary>
/// Shared helpers for Corti SDK example endpoints.
/// </summary>
public static class CortiHelpers
{
    public static bool TryCreateCortiClient(
        IConfiguration config,
        string? token,
        out CortiClient? client,
        out IResult errorResult)
    {
        var resolvedToken = token ?? config["Corti:AccessToken"] ?? config["Corti:Token"];
        var tenantName = config["Corti:TenantName"];
        if (string.IsNullOrEmpty(tenantName) || string.IsNullOrEmpty(resolvedToken))
        {
            client = null;
            errorResult = Results.BadRequest(new
            {
                error = "Corti credentials required. Pass token as query parameter, or set Corti:TenantName and Corti:AccessToken in appsettings or environment.",
            });
            return false;
        }

        var environment = string.Equals(config["Corti:Environment"], "us", StringComparison.OrdinalIgnoreCase)
            ? CortiClientEnvironment.Us
            : CortiClientEnvironment.Eu;
        client = new CortiClient(tenantName, resolvedToken, new ClientOptions { Environment = environment });
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
}
