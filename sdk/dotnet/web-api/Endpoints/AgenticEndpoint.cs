using Corti;
using Corti.Agentic;
using Corti.Agentic.Registry;
using CortiApiExamples;

namespace CortiApiExamples.Endpoints;

public static class AgenticEndpoint
{
    public static void MapAgenticEndpoint(this WebApplication app)
    {
        app.MapGet("/agentic", Handle);
    }

    private static async Task<IResult> Handle(IConfiguration config)
    {
        if (!CortiHelpers.TryCreateCortiClient(config, out var client, out var credentialError))
        {
            return credentialError;
        }

        try
        {
            var listedPager = await client!.Agentic.Agents.ListAsync(
                new AgenticAgentsListRequest { PageSize = 10 });
            var listAgents = listedPager.CurrentPage.Items.ToList();

            var createdAgent = await client.Agentic.Agents.CreateAsync(new AgenticAgentsCreateRequest
            {
                Name = $"SDK Example Agentic {DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                Description = "Example agent created via Agentic API v2.",
                Lifecycle = AgentsLifecycle.Ephemeral,
            });

            var getAgent = await client.Agentic.Agents.GetAsync(createdAgent.Id);
            var agentCard = await client.Agentic.Agents.CardAsync(createdAgent.Id);

            var registryPager = await client.Agentic.Registry.Connectors.ListAsync(
                new AgenticRegistryConnectorsListRequest { PageSize = 10 });
            var registryConnectors = registryPager.CurrentPage.Items.ToList();

            var sendMessageResponse = await client.Agentic.Agents.SendMessageAsync(
                createdAgent.Id,
                new AgenticAgentsSendMessageRequest
                {
                    Message = new CommonMessage
                    {
                        Role = CommonRole.RoleUser,
                        Parts = [new CommonPart { Text = "Hello from SDK agentic example" }],
                        MessageId = $"msg-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                    },
                });

            var contextsPager = await client.Agentic.Contexts.ListAsync(
                new AgenticContextsListRequest { AgentId = createdAgent.Id, PageSize = 10 });
            var contexts = contextsPager.CurrentPage.Items.ToList();

            var usage = await client.Agentic.Agents.UsageAsync(
                createdAgent.Id,
                new AgenticAgentsUsageRequest());

            await client.Agentic.Agents.DeleteAsync(createdAgent.Id);

            return Results.Ok(new
            {
                listCount = listAgents.Count,
                agents = listAgents,
                createdAgent,
                getAgent,
                agentCard,
                registryConnectorsCount = registryConnectors.Count,
                registryConnectors,
                sendMessageResponse,
                contextsCount = contexts.Count,
                contexts,
                usage,
                deletedAgentId = createdAgent.Id,
                message = "Agentic v2: list/create/get/card, registry connectors, sendMessage, contexts list, usage, delete",
            });
        }
        catch (CortiClientApiException ex)
        {
            return CortiHelpers.CortiApiErrorResult(ex);
        }
    }
}
