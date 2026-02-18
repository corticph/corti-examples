using CortiApi;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class FactsEndpoint
{
    public static void MapFactsEndpoint(this WebApplication app)
    {
        app.MapGet("/facts", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        string? token,
        string? interactionId)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, token, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            if (!string.IsNullOrEmpty(interactionId))
            {
                var listResp = await client!.Facts.ListAsync(interactionId);
                var facts = listResp.Facts?.ToList() ?? new List<FactsListItem>();
                return Results.Ok(new
                {
                    interactionId,
                    listCount = facts.Count,
                    facts,
                    message = "List facts completed successfully",
                });
            }

            var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
            var created = await client!.Interactions.CreateAsync(new InteractionsCreateRequest
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
            });
            var demoInteractionId = created.InteractionId;

            var factGroups = await client.Facts.FactGroupsListAsync();
            var listResp2 = await client.Facts.ListAsync(demoInteractionId);
            var listFacts = listResp2.Facts?.ToList() ?? new List<FactsListItem>();

            var createRequest = new FactsCreateRequest
            {
                Facts =
                [
                    new FactsCreateInput { Text = "Patient has trouble breathing", Group = "history-of-present-illness" },
                    new FactsCreateInput { Text = "Patient is experiencing chest pain", Group = "allergies" },
                ],
            };
            var createdFacts = await client.Facts.CreateAsync(demoInteractionId, createRequest);
            var firstFactId = createdFacts.Facts?.FirstOrDefault()?.Id;
            var secondFactId = createdFacts.Facts?.Skip(1).FirstOrDefault()?.Id;

            FactsUpdateResponse? updatedFact = null;
            if (!string.IsNullOrEmpty(firstFactId))
            {
                updatedFact = await client.Facts.UpdateAsync(demoInteractionId, firstFactId, new FactsUpdateRequest
                {
                    Text = "Patient has severe trouble breathing",
                    Source = CommonSourceEnum.User,
                });
            }

            FactsBatchUpdateResponse? batchUpdate = null;
            if (!string.IsNullOrEmpty(firstFactId) && !string.IsNullOrEmpty(secondFactId))
            {
                batchUpdate = await client.Facts.BatchUpdateAsync(demoInteractionId, new FactsBatchUpdateRequest
                {
                    Facts =
                    [
                        new FactsBatchUpdateInput { FactId = firstFactId, Text = "Patient has minor trouble breathing" },
                        new FactsBatchUpdateInput { FactId = secondFactId, Text = "Patient is experiencing severe chest pain" },
                    ],
                });
            }

            var extractResponse = await client.Facts.ExtractAsync(new FactsExtractRequest
            {
                Context =
                [
                    new CommonTextContext
                    {
                        Type = CommonTextContextType.Text,
                        Text = "Patient reports headache and fever for two days. No known allergies.",
                    },
                ],
                OutputLanguage = "en",
            });

            await client.Interactions.DeleteAsync(demoInteractionId);

            return Results.Ok(new
            {
                factGroups,
                listFacts,
                createdFacts,
                updatedFact,
                batchUpdate,
                extractResponse,
                message = "Fact groups, list, create, update, batch update, extract and cleanup completed successfully",
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
