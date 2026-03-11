using Corti;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class AgentsEndpoint
{
    public static void MapAgentsEndpoint(this WebApplication app)
    {
        app.MapGet("/agents", Handle);
    }

    private static async Task<IResult> Handle(
        IConfiguration config,
        int? limit,
        int? offset,
        bool? ephemeral)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var listRequest = new AgentsListRequest
            {
                Limit = limit,
                Offset = offset,
                Ephemeral = ephemeral,
            };
            var listAgentsRaw = (await client!.Agents.ListAsync(listRequest)).ToList();
            var createdAgent = await client.Agents.CreateAsync(new AgentsCreateAgent
            {
                Name = "SDK Example Agent",
                Description = "Example agent created via SDK for list and create demo.",
            });

            var getAgent = await client.Agents.GetAsync(createdAgent.Id);

            var agentCard = await client.Agents.GetCardAsync(createdAgent.Id);

            var registryExpertsResponse = await client.Agents.GetRegistryExpertsAsync(
                new AgentsGetRegistryExpertsRequest { Limit = 10, Offset = 0 });
            var registryExpertsList = registryExpertsResponse.Experts?.ToList() ?? new List<AgentsRegistryExpert>();

            var messageSendResponse = await client.Agents.MessageSendAsync(
                createdAgent.Id,
                new AgentsMessageSendParams
                {
                    Message = new AgentsMessage
                    {
                        Role = AgentsMessageRole.User,
                        Parts =
                        [
                            AgentsPart.FromAgentsTextPart(
                                new AgentsTextPart
                                {
                                    Kind = AgentsTextPartKind.Text,
                                    Text = "Hello from SDK example",
                                }),
                        ],
                        MessageId = $"msg-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                        Kind = AgentsMessageKind.Message,
                    },
                });

            AgentsTask? getTaskResult = null;
            AgentsContext? getContextResult = null;
            if (messageSendResponse.Task != null)
            {
                getTaskResult = await client.Agents.GetTaskAsync(
                    createdAgent.Id,
                    messageSendResponse.Task.Id,
                    new AgentsGetTaskRequest());
                getContextResult = await client.Agents.GetContextAsync(
                    createdAgent.Id,
                    messageSendResponse.Task.ContextId,
                    new AgentsGetContextRequest());
            }

            await client.Agents.DeleteAsync(createdAgent.Id);

            return Results.Ok(new
            {
                listCount = listAgentsRaw.Count,
                agents = listAgentsRaw,
                createdAgent,
                getAgent,
                agentCard,
                registryExpertsCount = registryExpertsList.Count,
                registryExperts = registryExpertsList,
                messageSendResponse,
                getTask = getTaskResult,
                getContext = getContextResult,
                deletedAgentId = createdAgent.Id,
                message = "Agents list, create, get, card, registry experts, message send, get task/context, and delete completed successfully",
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
