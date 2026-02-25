using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class DocumentsEndpoint
{
    public static void MapDocumentsEndpoint(this WebApplication app)
    {
        app.MapGet("/documents", Handle);
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
                var listResp = await client!.Documents.ListAsync(interactionId);
                var documents = listResp.Data?.ToList() ?? new List<DocumentsGetResponse>();
                return Results.Ok(new
                {
                    interactionId,
                    listCount = documents.Count,
                    documents,
                    message = "List documents completed successfully",
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

            var listResp2 = await client.Documents.ListAsync(demoInteractionId);
            var listDocuments = listResp2.Data?.ToList() ?? new List<DocumentsGetResponse>();

            var createBody = new DocumentsCreateRequestWithTemplateKey
            {
                Context =
                [
                    new DocumentsContextWithFacts
                    {
                        Type = DocumentsContextWithFactsType.Facts,
                        Data =
                        [
                            new FactsContext { Text = "Patient has trouble breathing", Source = CommonSourceEnum.Core },
                            new FactsContext { Text = "Patient is experiencing chest pain", Source = CommonSourceEnum.User },
                        ],
                    },
                ],
                TemplateKey = "corti-patient-summary",
                OutputLanguage = "en",
                Name = "Patient Consultation Note",
            };
            var createdDocument = await client.Documents.CreateAsync(demoInteractionId, createBody);
            var documentId = createdDocument.Id;

            var retrievedDocument = await client.Documents.GetAsync(demoInteractionId, documentId);

            var updatedDocument = await client.Documents.UpdateAsync(
                demoInteractionId,
                documentId,
                new DocumentsUpdateRequest
                {
                    Sections =
                    [
                        new DocumentsSectionInput
                        {
                            Key = "chief-complaint",
                            Text = "Patient reports severe trouble breathing and chest pain",
                        },
                    ],
                });

            await client.Documents.DeleteAsync(demoInteractionId, documentId);
            await client.Interactions.DeleteAsync(demoInteractionId);

            return Results.Ok(new
            {
                listDocuments,
                createdDocument,
                retrievedDocument,
                updatedDocument,
                message = "List, create, get, update, delete document and cleanup completed successfully",
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
