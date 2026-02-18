using CortiApiExamples.Endpoints;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.UseHttpsRedirection();

app.MapHomeEndpoint();
app.MapInteractionsEndpoint();
app.MapRecordingsEndpoint();
app.MapTranscriptsEndpoint();
app.MapFactsEndpoint();
app.MapCodesEndpoint();
app.MapTemplatesEndpoint();
app.MapAgentsEndpoint();
app.MapDocumentsEndpoint();
app.MapTranscribeEndpoint();

app.Run();
