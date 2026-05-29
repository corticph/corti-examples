using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class AmbientAsyncFactsEndpoint
{
    public static void MapAmbientAsyncFactsEndpoint(this WebApplication app)
    {
        app.MapGet("/ambient-async-facts", Handle);
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
            var samplePath = CortiHelpers.ResolveSampleFilePath(env.ContentRootPath, "trouble-breathing.mp3");
            if (samplePath is null)
            {
                return Results.BadRequest(new
                {
                    error =
                        "Sample file not found. Copy trouble-breathing.mp3 to sample/ or use typescript/next/public/trouble-breathing.mp3.",
                });
            }

            var interaction = await client!.Interactions.CreateAsync(
                new InteractionsCreateRequest
                {
                    Encounter = new InteractionsEncounterCreateRequest
                    {
                        Identifier = Guid.NewGuid().ToString(),
                        Status = InteractionsEncounterStatusEnum.Planned,
                        Type = InteractionsEncounterTypeEnum.FirstConsultation,
                    },
                }
            );

            await using var audioStream = File.OpenRead(samplePath);
            var recording = await client.Recordings.UploadAsync(interaction.InteractionId, audioStream);

            var transcript = await client.Transcripts.CreateAsync(
                interaction.InteractionId,
                new TranscriptsCreateRequest
                {
                    RecordingId = recording.RecordingId,
                    PrimaryLanguage = "en",
                    Diarize = true,
                    IsMultichannel = false,
                }
            );

            var context = new[]
            {
                new CommonTextContext
                {
                    Text = string.Join(" ", (transcript.Transcripts ?? Enumerable.Empty<CommonTranscriptResponse>()).Select(t => t.Text)),
                },
            };

            var factsResponse = await client.Facts.ExtractAsync(new FactsExtractRequest
            {
                Context = context,
                OutputLanguage = "en",
            });

            return Results.Ok(new
            {
                interactionId = interaction.InteractionId,
                recordingId = recording.RecordingId,
                transcript,
                facts = factsResponse.Facts,
                factCount = factsResponse.Facts.Count(),
                message = "Ambient async facts (SDK): upload recording, transcribe, extract facts.",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
