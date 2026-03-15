using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class TranscriptsEndpoint
{
    public static void MapTranscriptsEndpoint(this WebApplication app)
    {
        app.MapGet("/transcripts", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        IWebHostEnvironment env)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
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

            var samplePath = CortiHelpers.ResolveSampleFilePath(env.ContentRootPath, "trouble-breathing.mp3");
            if (samplePath is null)
            {
                await client.Interactions.DeleteAsync(demoInteractionId);
                return Results.BadRequest(new
                {
                    error = "Sample file not found. Copy typescript/next/public/trouble-breathing.mp3 to csharp/api/sample/.",
                });
            }

            string recordingId;
            await using (var sampleStream = File.OpenRead(samplePath))
            {
                var uploadResponse = await client.Recordings.UploadAsync(demoInteractionId, sampleStream);
                recordingId = uploadResponse.RecordingId;
            }

            var listResp2 = await client.Transcripts.ListAsync(demoInteractionId, new TranscriptsListRequest());
            var listTranscripts = listResp2.Transcripts?.ToList() ?? new List<TranscriptsListItem>();

            var createTranscriptRequest = new TranscriptsCreateRequest
            {
                RecordingId = recordingId,
                PrimaryLanguage = "en",
            };
            var createdTranscript = await client.Transcripts.CreateAsync(demoInteractionId, createTranscriptRequest);
            var transcriptId = createdTranscript.Id;

            var statusResponse = await client.Transcripts.GetStatusAsync(demoInteractionId, transcriptId);

            var getTranscript = await client.Transcripts.GetAsync(demoInteractionId, transcriptId);

            await client.Transcripts.DeleteAsync(demoInteractionId, transcriptId);
            await client.Recordings.DeleteAsync(demoInteractionId, recordingId);
            await client.Interactions.DeleteAsync(demoInteractionId);

            return Results.Ok(new
            {
                listTranscripts,
                createdTranscript = new { transcriptId = createdTranscript.Id },
                transcriptStatus = statusResponse,
                getTranscript,
                message = "List, create, get status, get, delete transcript and cleanup completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
