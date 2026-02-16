using CortiApi;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.UseHttpsRedirection();

app.MapGet("/", () => Results.Ok(new { message = "Corti SDK Examples API", status = "ok" }));

app.MapGet("/interactions", async (
    IConfiguration config,
    string? token,
    string? sort,
    string? direction,
    long? pageSize,
    long? index,
    string? encounterStatus,
    string? patient) =>
{
    var resolvedToken = token ?? config["Corti:AccessToken"] ?? config["Corti:Token"];
    var tenantName = config["Corti:TenantName"];
    if (string.IsNullOrEmpty(tenantName) || string.IsNullOrEmpty(resolvedToken))
    {
        return Results.BadRequest(new { error = "Corti credentials required. Pass token as query parameter, or set Corti:TenantName and Corti:AccessToken in appsettings or environment." });
    }

    try
    {
        var environment = string.Equals(config["Corti:Environment"], "us", StringComparison.OrdinalIgnoreCase)
            ? CortiClientEnvironment.Us
            : CortiClientEnvironment.Eu;
        var clientOptions = new ClientOptions { Environment = environment };
        var client = new CortiClient(tenantName, resolvedToken, clientOptions);

        var listRequest = new InteractionsListRequest
        {
            Sort = ParseSort(sort),
            Direction = ParseDirection(direction),
            PageSize = pageSize,
            Index = index ?? 1,
            EncounterStatus = ParseEncounterStatus(encounterStatus) ?? new List<InteractionsEncounterStatusEnum>(),
            Patient = patient,
        };
        var pager = await client.Interactions.ListAsync(listRequest);
        var collected = new List<InteractionsGetResponse>();
        await foreach (var item in pager)
        {
            collected.Add(item);
        }

        var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var createRequest = new InteractionsCreateRequest
        {
            Encounter = new InteractionsEncounterCreateRequest
            {
                Identifier = id,
                Status = InteractionsEncounterStatusEnum.Planned,
                Type = InteractionsEncounterTypeEnum.FirstConsultation,
            },
            Patient = new InteractionsPatient
            {
                Identifier = id,
                Gender = InteractionsGenderEnum.Unknown,
            },
        };
        var created = await client.Interactions.CreateAsync(createRequest);
        var interactionId = created.InteractionId;

        var got = await client.Interactions.GetAsync(new InteractionsGetRequest { Id = interactionId });

        var updated = await client.Interactions.UpdateAsync(new InteractionsUpdateRequest
        {
            Id = interactionId,
            Encounter = new InteractionsEncounterUpdateRequest { Status = InteractionsEncounterStatusEnum.InProgress },
        });

        await client.Interactions.DeleteAsync(new InteractionsDeleteRequest { Id = interactionId });

        return Results.Ok(new
        {
            listCount = collected.Count,
            list = collected,
            listRequest = new { sort = sort, direction = direction, pageSize = pageSize, index = index, encounterStatus = encounterStatus, patient = patient },
            createdInteraction = created,
            gotInteraction = got,
            updatedInteraction = updated,
            deletedId = interactionId,
            message = "List, create, get, update, and delete interactions completed successfully",
        });
    }
    catch (CortiClientApiException ex)
    {
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

static InteractionsListRequestSort? ParseSort(string? value)
{
    if (string.IsNullOrEmpty(value))
        return null;
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

static CommonSortingDirectionEnum? ParseDirection(string? value)
{
    if (string.IsNullOrEmpty(value))
        return null;
    return value.ToLowerInvariant() switch
    {
        "asc" => CommonSortingDirectionEnum.Asc,
        "desc" => CommonSortingDirectionEnum.Desc,
        _ => CommonSortingDirectionEnum.FromCustom(value),
    };
}

static IEnumerable<InteractionsEncounterStatusEnum>? ParseEncounterStatus(string? value)
{
    if (string.IsNullOrEmpty(value))
        return null;
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

app.Run();
