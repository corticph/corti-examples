using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class RecordingsEndpoint
{
    public static void MapRecordingsEndpoint(this WebApplication app)
    {
        app.MapGet("/recordings", Handle);
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

            var recordsList = await client.Recordings.ListAsync(demoInteractionId);
            var listRecordings = recordsList.Recordings?.ToList() ?? new List<string>();

            var samplePath = CortiHelpers.ResolveSampleFilePath(env.ContentRootPath, "trouble-breathing.mp3");
            if (samplePath is null)
            {
                await client.Interactions.DeleteAsync(demoInteractionId);
                return Results.BadRequest(new
                {
                    error = "Sample file not found. Copy typescript/next/public/trouble-breathing.mp3 to csharp/api/sample/.",
                });
            }

            await using (var sampleStream = File.OpenRead(samplePath))
            {
                var uploadResponse = await client.Recordings.UploadAsync(demoInteractionId, sampleStream);
                var recordingId = uploadResponse.RecordingId;

                var downloadDir = Path.Combine(env.ContentRootPath, "sample");
                Directory.CreateDirectory(downloadDir);
                var downloadedPath = Path.Combine(downloadDir, $"{recordingId}.mp3");
                await using (var getStream = await client.Recordings.GetAsync(demoInteractionId, recordingId))
                await using (var fileStream = File.Create(downloadedPath))
                {
                    await getStream.CopyToAsync(fileStream);
                }

                await client.Recordings.DeleteAsync(demoInteractionId, recordingId);
                await client.Interactions.DeleteAsync(demoInteractionId);

                return Results.Ok(new
                {
                    recordsList = listRecordings,
                    recordCreate = new { recordingId = uploadResponse.RecordingId },
                    downloadedPath,
                    message = "List, upload, get (download), delete recording and delete interaction completed successfully",
                });
            }
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }
}
