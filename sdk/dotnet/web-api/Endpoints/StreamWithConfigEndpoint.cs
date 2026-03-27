using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class StreamWithConfigEndpoint
{
    private const int ChunkSize = 4_096;

    public static void MapStreamWithConfigEndpoint(this WebApplication app)
    {
        app.MapGet("/stream-with-config", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        IWebHostEnvironment env,
        string? interactionId)
    {
        if (!CortiHelpers.TryGetCortiConfig(config, out var cc, out var credentialError))
        {
            return credentialError;
        }

        var client = new CortiClient(cc!.TenantName, cc.Environment, new CortiClientAuth.ClientCredentials(cc.ClientId, cc.ClientSecret));

        var interactionIdToUse = interactionId?.Trim();
        if (string.IsNullOrEmpty(interactionIdToUse))
        {
            var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
            var created = await client.Interactions.CreateAsync(new InteractionsCreateRequest
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
            interactionIdToUse = created.InteractionId;
        }

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
            var streamApi = await client.CreateStreamApiAsync(interactionIdToUse!);

            var messages = new List<object>();
            var flushedTcs = new TaskCompletionSource();

            void AddMessage(object msg)
            {
                lock (messages)
                {
                    messages.Add(msg);
                }
            }

            streamApi.StreamConfigStatusMessage.Subscribe(AddMessage);
            streamApi.StreamFlushedMessage.Subscribe((StreamFlushedMessage msg) =>
            {
                AddMessage(msg);
                flushedTcs.TrySetResult();
            });
            streamApi.StreamTranscriptMessage.Subscribe(AddMessage);
            streamApi.StreamFactsMessage.Subscribe(AddMessage);
            streamApi.StreamEndedMessage.Subscribe(AddMessage);
            streamApi.StreamUsageMessage.Subscribe(AddMessage);
            streamApi.StreamErrorMessage.Subscribe(AddMessage);

            // ConnectAsync sends configuration and resolves only after CONFIG_ACCEPTED.
            // It throws on CONFIG_DENIED / CONFIG_MISSING / CONFIG_TIMEOUT / CONFIG_NOT_PROVIDED.
            await streamApi.ConnectAsync(new StreamConfig
            {
                Transcription = new StreamConfigTranscription
                {
                    PrimaryLanguage = "en",
                    Participants = new List<StreamConfigParticipant>(),
                },
                Mode = new StreamConfigMode { Type = StreamConfigModeType.Transcription },
            });

            var chunkCount = 0;
            await using (var sampleStream = File.OpenRead(samplePath))
            {
                var audioBuffer = new byte[ChunkSize];
                int read;
                while ((read = await sampleStream.ReadAsync(audioBuffer, CancellationToken.None)) > 0)
                {
                    var chunk = new byte[read];
                    Array.Copy(audioBuffer, chunk, read);
                    await streamApi.Send(chunk);
                    chunkCount++;
                }
            }

            await streamApi.Send(new StreamFlushMessage());
            await flushedTcs.Task;

            await streamApi.CloseAsync();
            await streamApi.DisposeAsync();

            return Results.Ok(new
            {
                interactionId = interactionIdToUse,
                messageCount = messages.Count,
                messages,
                message = "Stream WebSocket (SDK, with config): configuration passed to ConnectAsync(), audio sent by chunks, flush sent, flushed received.",
            });
        }
        catch (Exception ex)
        {
            return Results.Json(new { error = ex.Message }, statusCode: 500);
        }
    }
}
