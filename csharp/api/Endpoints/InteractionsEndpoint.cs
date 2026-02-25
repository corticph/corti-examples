using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class InteractionsEndpoint
{
    public static void MapInteractionsEndpoint(this WebApplication app)
    {
        app.MapGet("/interactions", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        string? token,
        string? sort,
        string? direction,
        long? pageSize,
        long? index,
        string? encounterStatus,
        string? patient)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, token, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var listRequest = new InteractionsListRequest
            {
                Sort = CortiHelpers.ParseSort(sort),
                Direction = CortiHelpers.ParseDirection(direction),
                PageSize = pageSize,
                Index = index ?? 1,
                EncounterStatus = CortiHelpers.ParseEncounterStatus(encounterStatus) ?? new List<InteractionsEncounterStatusEnum>(),
                Patient = patient,
            };
            var pager = await client!.Interactions.ListAsync(listRequest);
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

            var got = await client.Interactions.GetAsync(interactionId);

            var updated = await client.Interactions.UpdateAsync(interactionId, new InteractionsUpdateRequest
            {
                Encounter = new InteractionsEncounterUpdateRequest { Status = InteractionsEncounterStatusEnum.InProgress },
            });

            await client.Interactions.DeleteAsync(interactionId);

            return Results.Ok(new
            {
                listCount = collected.Count,
                list = collected,
                listRequest = new { sort, direction, pageSize, index, encounterStatus, patient },
                createdInteraction = created,
                gotInteraction = got,
                updatedInteraction = updated,
                deletedId = interactionId,
                message = "List, create, get, update, and delete interactions completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }
}
