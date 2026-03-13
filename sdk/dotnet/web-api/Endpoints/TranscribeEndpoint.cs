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
        IWebHostEnvironment env)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
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
            var transcribeApi = await client!.CreateTranscribeApiAsync();

            var messages = new List<object>();
            var configAcceptedTcs = new TaskCompletionSource();
            var flushedTcs = new TaskCompletionSource();

            void AddMessage(object msg)
            {
                lock (messages)
                {
                    messages.Add(msg);
                }
            }

            transcribeApi.TranscribeConfigStatusMessage.Subscribe((TranscribeConfigStatusMessage msg) =>
            {
                AddMessage(msg);
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
                flushedTcs.TrySetResult();
            });
            transcribeApi.TranscribeUsageMessage.Subscribe(msg => AddMessage(msg));
            transcribeApi.TranscribeTranscriptMessage.Subscribe(msg => AddMessage(msg));
            transcribeApi.TranscribeErrorMessage.Subscribe(msg => AddMessage(msg));
            transcribeApi.TranscribeCommandMessage.Subscribe(msg => AddMessage(msg));
            transcribeApi.TranscribeEndedMessage.Subscribe(msg => AddMessage(msg));

            await transcribeApi.ConnectAsync();

            await transcribeApi.Send(new TranscribeConfigMessage
            {
                Type = TranscribeConfigMessageType.Config,
                Configuration = new TranscribeConfig { PrimaryLanguage = "en" },
            });
            await configAcceptedTcs.Task;

            const int chunkSize = 4_096;
            var chunkCount = 0;
            await using (var sampleStream = File.OpenRead(samplePath))
            {
                var audioBuffer = new byte[chunkSize];
                int read;
                while ((read = await sampleStream.ReadAsync(audioBuffer, CancellationToken.None)) > 0)
                {
                    var chunk = new byte[read];
                    Array.Copy(audioBuffer, chunk, read);
                    await transcribeApi.Send(chunk);
                    chunkCount++;
                }
            }

            await transcribeApi.Send(new TranscribeFlushMessage { Type = TranscribeFlushMessageType.Flush });
            await flushedTcs.Task;

            await transcribeApi.CloseAsync();
            await transcribeApi.DisposeAsync();

            return Results.Ok(new
            {
                messageCount = messages.Count,
                messages,
                message = "Transcribe WebSocket (SDK): config sent, audio sent by chunks, flush sent, flushed received.",
            });
        }
        catch (Exception ex)
        {
            return Results.Json(new { error = ex.Message }, statusCode: 500);
        }
    }
}
