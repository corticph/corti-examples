using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class StreamEndpoint
{
    private const int ChunkSize = 4_096;

    public static void MapStreamEndpoint(this WebApplication app)
    {
        app.MapGet("/stream", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        IWebHostEnvironment env,
        string? token,
        string? interactionId)
    {
        Console.WriteLine("[Stream] Starting /stream request.");
        if (!CortiHelpers.TryCreateCortiClient(config, token, out var client, out var credentialError))
        {
            Console.WriteLine("[Stream] Credentials missing or invalid.");
            return credentialError;
        }

        var resolvedToken = token ?? config["Corti:AccessToken"] ?? config["Corti:Token"];
        var tenantName = config["Corti:TenantName"];
        if (!resolvedToken!.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            resolvedToken = "Bearer " + resolvedToken;
        }

        var interactionIdToUse = interactionId?.Trim();
        if (string.IsNullOrEmpty(interactionIdToUse))
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
            interactionIdToUse = created.InteractionId;
            Console.WriteLine("[Stream] Created interaction: {0}", interactionIdToUse);
        }

        var samplePath = CortiHelpers.ResolveSampleFilePath(env.ContentRootPath, "trouble-breathing.mp3");
        if (samplePath is null)
        {
            return Results.BadRequest(new
            {
                error = "Sample file not found. Copy typescript/next/public/trouble-breathing.mp3 to csharp/api/sample/.",
            });
        }

        var streamEnvironment = string.Equals(config["Corti:Environment"], "us", StringComparison.OrdinalIgnoreCase) ? "US" : "EU";
        Console.WriteLine("[Stream] Environment: {0}", streamEnvironment);

        try
        {
            var streamApi = client!.CreateStreamApi(new StreamApi.Options
            {
                Environment = streamEnvironment,
                TenantName = tenantName!,
                Token = resolvedToken,
                Id = interactionIdToUse!,
            });
            Console.WriteLine("[Stream] StreamApi created.");

            var messages = new List<object>();
            var configAcceptedTcs = new TaskCompletionSource();
            var flushedTcs = new TaskCompletionSource();

            void AddMessage(object msg)
            {
                lock (messages)
                {
                    messages.Add(msg);
                    Console.WriteLine("[Stream] Message #{0} ({1}): {2}", messages.Count, msg.GetType().Name, msg);
                }
            }

            streamApi.StreamConfigStatusMessage.Subscribe((StreamConfigStatusMessage msg) =>
            {
                AddMessage(msg);
                Console.WriteLine("[Stream] Received config status: {0}", msg.Type);
                if (msg.Type == StreamConfigStatusMessageType.ConfigAccepted)
                {
                    configAcceptedTcs.TrySetResult();
                }
                if (msg.Type == StreamConfigStatusMessageType.ConfigDenied ||
                    msg.Type == StreamConfigStatusMessageType.ConfigTimeout ||
                    msg.Type == StreamConfigStatusMessageType.ConfigMissing ||
                    msg.Type == StreamConfigStatusMessageType.ConfigNotProvided ||
                    msg.Type == StreamConfigStatusMessageType.ConfigAlreadyReceived)
                {
                    configAcceptedTcs.TrySetException(new InvalidOperationException($"Config not accepted: {msg.Type}"));
                }
            });
            streamApi.StreamFlushedMessage.Subscribe((StreamFlushedMessage msg) =>
            {
                AddMessage(msg);
                Console.WriteLine("[Stream] Received flushed.");
                flushedTcs.TrySetResult();
            });
            streamApi.StreamTranscriptMessage.Subscribe(AddMessage);
            streamApi.StreamFactsMessage.Subscribe(AddMessage);
            streamApi.StreamEndedMessage.Subscribe(AddMessage);
            streamApi.StreamUsageMessage.Subscribe(AddMessage);
            streamApi.StreamErrorMessage.Subscribe(AddMessage);
            Console.WriteLine("[Stream] Subscribed to all message types.");

            Console.WriteLine("[Stream] Connecting WebSocket...");
            await streamApi.ConnectAsync();
            Console.WriteLine("[Stream] WebSocket connected.");

            Console.WriteLine("[Stream] Sending config once (transcription, primaryLanguage=en)...");
            await streamApi.Send(new StreamConfigMessage
            {
                Type = StreamConfigMessageType.Config,
                Configuration = new StreamConfig
                {
                    Transcription = new StreamConfigTranscription
                    {
                        PrimaryLanguage = "en",
                        Participants = new List<StreamConfigParticipant>(),
                    },
                    Mode = new StreamConfigMode { Type = StreamConfigModeType.Transcription },
                },
            });
            await configAcceptedTcs.Task;
            Console.WriteLine("[Stream] Config accepted.");

            var chunkCount = 0;
            await using (var sampleStream = File.OpenRead(samplePath))
            {
                var audioBuffer = new byte[ChunkSize];
                int read;
                Console.WriteLine("[Stream] Sending audio (chunks of {0} bytes)...", ChunkSize);
                while ((read = await sampleStream.ReadAsync(audioBuffer, CancellationToken.None)) > 0)
                {
                    var chunk = new byte[read];
                    Array.Copy(audioBuffer, chunk, read);
                    await streamApi.Send(chunk);
                    chunkCount++;
                }
            }
            Console.WriteLine("[Stream] Audio sent ({0} chunks).", chunkCount);

            Console.WriteLine("[Stream] Sending flush...");
            await streamApi.Send(new StreamFlushMessage { Type = StreamFlushMessageType.Flush });
            await flushedTcs.Task;
            Console.WriteLine("[Stream] Flush completed.");

            Console.WriteLine("[Stream] Closing WebSocket...");
            await streamApi.CloseAsync();
            await streamApi.DisposeAsync();
            Console.WriteLine("[Stream] Done. Total messages: {0}.", messages.Count);

            return Results.Ok(new
            {
                interactionId = interactionIdToUse,
                messageCount = messages.Count,
                messages,
                message = "Stream WebSocket (SDK): config sent, audio sent by chunks, flush sent, flushed received.",
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine("[Stream] Error: {0}", ex.Message);
            return Results.Json(new { error = ex.Message }, statusCode: 500);
        }
    }
}
