using CortiApiExamples.Endpoints;
using DotNetEnv;

var dir = Directory.GetCurrentDirectory();

// Load .env and .env.local (if present); .env.local overrides .env
if (File.Exists(Path.Combine(dir, ".env")))
    Env.Load(Path.Combine(dir, ".env"));
if (File.Exists(Path.Combine(dir, ".env.local")))
    Env.Load(Path.Combine(dir, ".env.local"));

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

// Only redirect to HTTPS when the app is configured for HTTPS (e.g. local dev). In Docker we use HTTP only on 8080.
var urls = builder.Configuration["ASPNETCORE_URLS"] ?? "";
if (urls.Contains("https", StringComparison.OrdinalIgnoreCase))
    app.UseHttpsRedirection();

app.MapTokenEndpoint();
app.MapInteractionsEndpoint();
app.MapRecordingsEndpoint();
app.MapTranscriptsEndpoint();
app.MapFactsEndpoint();
app.MapCodesEndpoint();
app.MapTemplatesEndpoint();
app.MapAgentsEndpoint();
app.MapDocumentsEndpoint();
// Stream and Transcribe endpoints not currently exposed; endpoint code kept in StreamEndpoint.cs / TranscribeEndpoint.cs for when they work.
// app.MapTranscribeEndpoint();
// app.MapStreamEndpoint();

app.Run();
