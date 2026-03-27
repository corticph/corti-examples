using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class TranscribeWithConfigEndpoint
{
    public static void MapTranscribeWithConfigEndpoint(this WebApplication app)
    {
        app.MapGet("/transcribe-with-config", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        IWebHostEnvironment env)
    {
        if (!CortiHelpers.TryGetCortiConfig(config, out var cc, out var credentialError))
        {
            return credentialError;
        }

        var client = new CortiClient(cc!.TenantName, cc.Environment, new CortiClientAuth.ClientCredentials(cc.ClientId, cc.ClientSecret));

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
            var transcribeApi = await client.CreateTranscribeApiAsync();

            var messages = new List<object>();
            var flushedTcs = new TaskCompletionSource();

            void AddMessage(object msg)
            {
                lock (messages)
                {
                    messages.Add(msg);
                }
            }

            transcribeApi.TranscribeConfigStatusMessage.Subscribe(AddMessage);
            transcribeApi.TranscribeFlushedMessage.Subscribe((TranscribeFlushedMessage msg) =>
            {
                AddMessage(msg);
                flushedTcs.TrySetResult();
            });
            transcribeApi.TranscribeUsageMessage.Subscribe(AddMessage);
            transcribeApi.TranscribeTranscriptMessage.Subscribe(AddMessage);
            transcribeApi.TranscribeErrorMessage.Subscribe(AddMessage);
            transcribeApi.TranscribeCommandMessage.Subscribe(AddMessage);
            transcribeApi.TranscribeEndedMessage.Subscribe(AddMessage);

            // ConnectAsync sends configuration and resolves only after CONFIG_ACCEPTED.
            // It throws on CONFIG_DENIED / CONFIG_TIMEOUT.
            await transcribeApi.ConnectAsync(new TranscribeConfig { PrimaryLanguage = "en" });

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

            await transcribeApi.Send(new TranscribeFlushMessage());
            await flushedTcs.Task;

            await transcribeApi.CloseAsync();
            await transcribeApi.DisposeAsync();

            return Results.Ok(new
            {
                messageCount = messages.Count,
                messages,
                message = "Transcribe WebSocket (SDK, with config): configuration passed to ConnectAsync(), audio sent by chunks, flush sent, flushed received.",
            });
        }
        catch (Exception ex)
        {
            return Results.Json(new { error = ex.Message }, statusCode: 500);
        }
    }
}
