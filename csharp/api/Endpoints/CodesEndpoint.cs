using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class CodesEndpoint
{
    public static void MapCodesEndpoint(this WebApplication app)
    {
        app.MapGet("/codes", Handle);
    }

    private static async Task<IResult> Handle(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var predictResponse = await client!.Codes.PredictAsync(new CodesGeneralPredictRequest
            {
                System = [CommonCodingSystemEnum.Icd10Cm, CommonCodingSystemEnum.Cpt],
                Context =
                [
                    new CommonTextContext
                    {
                        Type = CommonTextContextType.Text,
                        Text = "Short arm splint applied in ED for pain control.",
                    },
                ],
                MaxCandidates = 5,
            });

            return Results.Ok(new
            {
                predictResponse,
                message = "Code prediction completed successfully",
            });
        }
        catch (CortiClientApiException ex)
        {
            return Results.Json(
                new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body },
                statusCode: (int)ex.StatusCode);
        }
    }
}
