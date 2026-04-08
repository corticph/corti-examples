using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class AmbientRtStreamsEndpoint
{
    private const int ChunkSize = 32_000;

    public static void MapAmbientRtStreamsEndpoint(this WebApplication app)
    {
        app.MapGet("/ambient-rt-streams", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        IWebHostEnvironment env)
    {
        if (!CortiHelpers.TryGetCortiConfig(config, out var cc, out var credentialError))
        {
            return credentialError;
        }

        var client = new CortiClient(
            cc!.TenantName,
            cc.Environment,
            new CortiClientAuth.ClientCredentials(cc.ClientId, cc.ClientSecret)
        );

        var samplePath = CortiHelpers.ResolveSampleFilePath(env.ContentRootPath, "trouble-breathing.mp3");
        if (samplePath is null)
        {
            return Results.BadRequest(new
            {
                error = "Sample file not found. Copy typescript/next/public/trouble-breathing.mp3 to csharp/api/sample/.",
            });
        }

        try
        {
            var now = DateTime.UtcNow;
            var interaction = await client.Interactions.CreateAsync(
                new InteractionsCreateRequest
                {
                    AssignedUserId = Guid.NewGuid().ToString(),
                    Encounter = new InteractionsEncounterCreateRequest
                    {
                        Identifier = Guid.NewGuid().ToString(),
                        Status = InteractionsEncounterStatusEnum.Planned,
                        Type = InteractionsEncounterTypeEnum.FirstConsultation,
                        Period = new InteractionsEncounterPeriod
                        {
                            StartedAt = now,
                            EndedAt = now,
                        },
                        Title = "Consultation",
                    },
                }
            );

            await using var stream = await client.CreateStreamApiAsync(interaction.InteractionId);

            var messages = new List<object>();
            var endedTcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

            void AddMessage(object msg)
            {
                lock (messages)
                {
                    messages.Add(msg);
                }
            }

            stream.StreamConfigStatusMessage.Subscribe(AddMessage);
            stream.StreamTranscriptMessage.Subscribe(AddMessage);
            stream.StreamFactsMessage.Subscribe(AddMessage);
            stream.StreamUsageMessage.Subscribe(AddMessage);
            stream.StreamErrorMessage.Subscribe(AddMessage);
            stream.StreamEndedMessage.Subscribe(msg =>
            {
                AddMessage(msg);
                endedTcs.TrySetResult();
            });

            await stream.ConnectAsync(new StreamConfig
            {
                Transcription = new StreamConfigTranscription
                {
                    PrimaryLanguage = "en",
                    IsDiarization = false,
                    IsMultichannel = false,
                    Participants = new List<StreamConfigParticipant>
                    {
                        new() { Channel = 0, Role = StreamConfigParticipantRole.Multiple },
                    },
                },
                Mode = new StreamConfigMode
                {
                    Type = StreamConfigModeType.Facts,
                    OutputLocale = "en",
                },
            });

            await using (var audioStream = File.OpenRead(samplePath))
            {
                var buffer = new byte[ChunkSize];
                int read;
                while ((read = await audioStream.ReadAsync(buffer, CancellationToken.None)) > 0)
                {
                    if (read == buffer.Length)
                    {
                        await stream.Send(buffer);
                    }
                    else
                    {
                        var chunk = new byte[read];
                        Buffer.BlockCopy(buffer, 0, chunk, 0, read);
                        await stream.Send(chunk);
                    }
                }
            }

            await stream.Send(new StreamEndMessage());
            await endedTcs.Task;

            await stream.CloseAsync();

            return Results.Ok(new
            {
                interactionId = interaction.InteractionId,
                messageCount = messages.Count,
                messages,
                message = "Ambient RT streams (SDK): connect with facts config, stream audio, end, await ENDED.",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}

