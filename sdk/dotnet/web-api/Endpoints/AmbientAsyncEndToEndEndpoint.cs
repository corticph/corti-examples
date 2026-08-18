using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class AmbientAsyncEndToEndEndpoint
{
    public static void MapAmbientAsyncEndToEndEndpoint(this WebApplication app)
    {
        app.MapGet("/ambient-async-end-to-end", Handle);
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

            var interactionId = Guid.NewGuid().ToString();
            var interaction = await client!.Interactions.CreateAsync(
                new InteractionsCreateRequest
                {
                    Encounter = new InteractionsEncounterCreateRequest
                    {
                        Identifier = interactionId,
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
                }
            );

            var document = await client.Documents.Classic.CreateAsync(
                interaction.InteractionId,
                DocumentsCreateRequest.FromDocumentsCreateRequestWithTemplateKey(
                    new DocumentsCreateRequestWithTemplateKey
                    {
                        Context = (transcript.Transcripts ?? Enumerable.Empty<CommonTranscriptResponse>())
                            .Select(t => DocumentsContext.FromDocumentsContextWithTranscript(
                                new DocumentsContextWithTranscript
                                {
                                    Type = DocumentsContextWithTranscriptType.Transcript,
                                    Data = new CommonTranscriptRequest
                                    {
                                        Channel = t.Channel,
                                        Participant = t.Participant,
                                        SpeakerId = t.SpeakerId,
                                        Text = t.Text,
                                        Start = t.Start,
                                        End = t.End,
                                    },
                                }
                            ))
                            .ToArray(),
                        TemplateKey = "soap",
                        OutputLanguage = "en",
                    }
                )
            );

            return Results.Ok(new
            {
                interactionId = interaction.InteractionId,
                recordingId = recording.RecordingId,
                transcript,
                document,
                documentName = document.Name,
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}

