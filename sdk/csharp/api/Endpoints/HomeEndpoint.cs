namespace CortiApiExamples.Endpoints;

public static class HomeEndpoint
{
    public static void MapHomeEndpoint(this WebApplication app)
    {
        app.MapGet("/", () => Results.Ok(new { message = "Corti SDK Examples API", status = "ok" }));
    }
}
