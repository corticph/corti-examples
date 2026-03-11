// Not currently exposed in the API (MapTranscribeEndpoint is commented out in Program.cs). Code kept for when it works.
using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class TranscribeEndpoint
{
    public static void MapTranscribeEndpoint(this WebApplication app)
    {
        app.MapGet("/transcribe", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        IWebHostEnvironment env,
        string? token)
    {
        Console.WriteLine("[Transcribe] Starting /transcribe request.");
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            Console.WriteLine("[Transcribe] Credentials missing or invalid.");
            return credentialError;
        }

        var resolvedToken = token ?? config["Corti:AccessToken"] ?? config["Corti:Token"];
        var tenantName = config["Corti:TenantName"];
        if (!resolvedToken!.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            resolvedToken = "Bearer " + resolvedToken;
        }

        var samplePath = CortiHelpers.ResolveSampleFilePath(env.ContentRootPath, "trouble-breathing.mp3");
        if (samplePath is null)
        {
            Console.WriteLine("[Transcribe] Sample file not found.");
            return Results.BadRequest(new
            {
                error = "Sample file not found. Copy typescript/next/public/trouble-breathing.mp3 to csharp/api/sample/.",
            });
        }
        Console.WriteLine("[Transcribe] Sample file: {0}", samplePath);

        var transcribeEnvironment = string.Equals(config["Corti:Environment"], "us", StringComparison.OrdinalIgnoreCase)
            ? "US"
            : "EU";
        Console.WriteLine("[Transcribe] Environment: {0}", transcribeEnvironment);

        try
        {
            var transcribeApi = client!.CreateTranscribeApi(new TranscribeApi.Options
            {
                Environment = transcribeEnvironment,
                TenantName = tenantName!,
                Token = resolvedToken,
            });
            Console.WriteLine("[Transcribe] TranscribeApi created.");

            var messages = new List<object>();
            var configAcceptedTcs = new TaskCompletionSource();
            var flushedTcs = new TaskCompletionSource();

            void AddMessage(object msg)
            {
                lock (messages)
                {
                    messages.Add(msg);
                    Console.WriteLine("[Transcribe] Message #{0} ({1}): {2}", messages.Count, msg.GetType().Name, msg);
                }
            }

            transcribeApi.TranscribeConfigStatusMessage.Subscribe((TranscribeConfigStatusMessage msg) =>
            {
                AddMessage(msg);
                Console.WriteLine("[Transcribe] Received config status: {0}", msg.Type);
                if (msg.Type == TranscribeConfigStatusMessageType.ConfigAccepted)
                {
                    configAcceptedTcs.TrySetResult();
                }
                if (msg.Type == TranscribeConfigStatusMessageType.ConfigDenied ||
                    msg.Type == TranscribeConfigStatusMessageType.ConfigTimeout)
                {
                    configAcceptedTcs.TrySetException(new InvalidOperationException($"Config not accepted: {msg.Type}"));
                }
            });
            transcribeApi.TranscribeFlushedMessage.Subscribe((TranscribeFlushedMessage msg) =>
            {
                AddMessage(msg);
                Console.WriteLine("[Transcribe] Received flushed (payload type: {0}).", msg.Type);
                flushedTcs.TrySetResult();
            });
            transcribeApi.TranscribeUsageMessage.Subscribe(msg =>
            {
                AddMessage(msg);
                Console.WriteLine("[Transcribe] Received usage: {0}", msg);
            });
            transcribeApi.TranscribeTranscriptMessage.Subscribe(msg =>
            {
                AddMessage(msg);
                Console.WriteLine("[Transcribe] Received transcript: {0}", msg);
            });
            transcribeApi.TranscribeErrorMessage.Subscribe(msg =>
            {
                AddMessage(msg);
                Console.WriteLine("[Transcribe] Received error message: {0}", msg);
            });
            transcribeApi.TranscribeCommandMessage.Subscribe(msg =>
            {
                AddMessage(msg);
                Console.WriteLine("[Transcribe] Received command: {0}", msg);
            });
            transcribeApi.TranscribeEndedMessage.Subscribe(msg =>
            {
                AddMessage(msg);
                Console.WriteLine("[Transcribe] Received ended: {0}", msg);
            });
            Console.WriteLine("[Transcribe] Subscribed to all message types.");

            Console.WriteLine("[Transcribe] Connecting WebSocket...");
            await transcribeApi.ConnectAsync();
            Console.WriteLine("[Transcribe] WebSocket connected.");

            Console.WriteLine("[Transcribe] Sending config once (primaryLanguage=en)...");
            await transcribeApi.Send(new TranscribeConfigMessage
            {
                Type = "config",
                Configuration = new TranscribeConfig { PrimaryLanguage = "en" },
            });
            await configAcceptedTcs.Task;
            Console.WriteLine("[Transcribe] Config accepted. No more config will be sent.");

            const int chunkSize = 4_096;
            var chunkCount = 0;
            await using (var sampleStream = File.OpenRead(samplePath))
            {
                var audioBuffer = new byte[chunkSize];
                int read;
                Console.WriteLine("[Transcribe] Sending audio only (chunks of {0} bytes)...", chunkSize);
                while ((read = await sampleStream.ReadAsync(audioBuffer, CancellationToken.None)) > 0)
                {
                    var chunk = new byte[read];
                    Array.Copy(audioBuffer, chunk, read);
                    await transcribeApi.Send(chunk);
                    chunkCount++;
                }
            }
            Console.WriteLine("[Transcribe] Audio sent ({0} chunks).", chunkCount);

            Console.WriteLine("[Transcribe] Sending flush...");
            await transcribeApi.Send(new TranscribeFlushMessage { Type = "flush" });
            await flushedTcs.Task;
            Console.WriteLine("[Transcribe] Flush completed.");

            Console.WriteLine("[Transcribe] Closing WebSocket...");
            await transcribeApi.CloseAsync();
            await transcribeApi.DisposeAsync();
            Console.WriteLine("[Transcribe] WebSocket closed.");

            Console.WriteLine("[Transcribe] Done. Total messages: {0}.", messages.Count);
            return Results.Ok(new
            {
                messageCount = messages.Count,
                messages,
                message = "Transcribe WebSocket (SDK): config sent, audio sent by chunks, flush sent, flushed received.",
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine("[Transcribe] Error: {0}", ex.Message);
            return Results.Json(new { error = ex.Message }, statusCode: 500);
        }
    }
}
