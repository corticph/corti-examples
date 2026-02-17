using CortiApi;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.UseHttpsRedirection();

app.MapGet("/", () => Results.Ok(new { message = "Corti SDK Examples API", status = "ok" }));

app.MapGet("/interactions", async (
    IConfiguration config,
    string? token,
    string? sort,
    string? direction,
    long? pageSize,
    long? index,
    string? encounterStatus,
    string? patient) =>
{
    if (!TryCreateCortiClient(config, token, out var client, out var credentialError))
    {
        return credentialError;
    }

    try
    {

        var listRequest = new InteractionsListRequest
        {
            Sort = ParseSort(sort),
            Direction = ParseDirection(direction),
            PageSize = pageSize,
            Index = index ?? 1,
            EncounterStatus = ParseEncounterStatus(encounterStatus) ?? new List<InteractionsEncounterStatusEnum>(),
            Patient = patient,
        };
        var pager = await client.Interactions.ListAsync(listRequest);
        var collected = new List<InteractionsGetResponse>();
        await foreach (var item in pager)
        {
            collected.Add(item);
        }

        var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var createRequest = new InteractionsCreateRequest
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
        };
        var created = await client.Interactions.CreateAsync(createRequest);
        var interactionId = created.InteractionId;

        var got = await client.Interactions.GetAsync(interactionId);

        var updated = await client.Interactions.UpdateAsync(interactionId, new InteractionsUpdateRequest
        {
            Encounter = new InteractionsEncounterUpdateRequest { Status = InteractionsEncounterStatusEnum.InProgress },
        });

        await client.Interactions.DeleteAsync(interactionId);

        return Results.Ok(new
        {
            listCount = collected.Count,
            list = collected,
            listRequest = new { sort = sort, direction = direction, pageSize = pageSize, index = index, encounterStatus = encounterStatus, patient = patient },
            createdInteraction = created,
            gotInteraction = got,
            updatedInteraction = updated,
            deletedId = interactionId,
            message = "List, create, get, update, and delete interactions completed successfully",
        });
    }
    catch (CortiClientApiException ex)
    {
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

app.MapGet("/recordings", async (IConfiguration config, IWebHostEnvironment env, string? token, string? interactionId) =>
{
    if (!TryCreateCortiClient(config, token, out var client, out var credentialError))
    {
        return credentialError;
    }

    try
    {
        if (!string.IsNullOrEmpty(interactionId))
        {
            var listResponse = await client.Recordings.ListAsync(interactionId);
            var recordings = listResponse.Recordings?.ToList() ?? new List<string>();
            return Results.Ok(new
            {
                interactionId,
                listCount = recordings.Count,
                recordings,
                message = "List recordings completed successfully",
            });
        }

        var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var created = await client.Interactions.CreateAsync(new InteractionsCreateRequest
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
        var demoInteractionId = created.InteractionId;

        var recordsList = await client.Recordings.ListAsync(demoInteractionId);
        var listRecordings = recordsList.Recordings?.ToList() ?? new List<string>();

        var samplePath = ResolveSampleFilePath(env.ContentRootPath, "trouble-breathing.mp3");
        if (samplePath is null)
        {
            await client.Interactions.DeleteAsync(demoInteractionId);
            return Results.BadRequest(new { error = "Sample file not found. Copy typescript/next/public/trouble-breathing.mp3 to csharp/api/sample/." });
        }

        await using (var sampleStream = File.OpenRead(samplePath))
        {
            var uploadResponse = await client.Recordings.UploadAsync(demoInteractionId, sampleStream);
            var recordingId = uploadResponse.RecordingId;

            var downloadDir = Path.Combine(env.ContentRootPath, "sample");
            Directory.CreateDirectory(downloadDir);
            var downloadedPath = Path.Combine(downloadDir, $"{recordingId}.mp3");
            await using (var getStream = await client.Recordings.GetAsync(demoInteractionId, recordingId))
            await using (var fileStream = File.Create(downloadedPath))
            {
                await getStream.CopyToAsync(fileStream);
            }

            await client.Recordings.DeleteAsync(demoInteractionId, recordingId);
            await client.Interactions.DeleteAsync(demoInteractionId);

            return Results.Ok(new
            {
                recordsList = listRecordings,
                recordCreate = new { recordingId = uploadResponse.RecordingId },
                downloadedPath,
                message = "List, upload, get (download), delete recording and delete interaction completed successfully",
            });
        }
    }
    catch (CortiClientApiException ex)
    {
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

app.MapGet("/transcripts", async (IConfiguration config, IWebHostEnvironment env, string? token, string? interactionId) =>
{
    if (!TryCreateCortiClient(config, token, out var client, out var credentialError))
    {
        return credentialError;
    }

    try
    {
        if (!string.IsNullOrEmpty(interactionId))
        {
            var listResp = await client.Transcripts.ListAsync(interactionId, new TranscriptsListRequest());
            var transcripts = listResp.Transcripts?.ToList() ?? new List<TranscriptsListItem>();
            return Results.Ok(new
            {
                interactionId,
                listCount = transcripts.Count,
                transcripts,
                message = "List transcripts completed successfully",
            });
        }

        var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var created = await client.Interactions.CreateAsync(new InteractionsCreateRequest
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
        var demoInteractionId = created.InteractionId;

        var samplePath = ResolveSampleFilePath(env.ContentRootPath, "trouble-breathing.mp3");
        if (samplePath is null)
        {
            await client.Interactions.DeleteAsync(demoInteractionId);
            return Results.BadRequest(new { error = "Sample file not found. Copy typescript/next/public/trouble-breathing.mp3 to csharp/api/sample/." });
        }

        string recordingId;
        await using (var sampleStream = File.OpenRead(samplePath))
        {
            var uploadResponse = await client.Recordings.UploadAsync(demoInteractionId, sampleStream);
            recordingId = uploadResponse.RecordingId;
        }

        var listResp2 = await client.Transcripts.ListAsync(demoInteractionId, new TranscriptsListRequest());
        var listTranscripts = listResp2.Transcripts?.ToList() ?? new List<TranscriptsListItem>();

        var createTranscriptRequest = new TranscriptsCreateRequest
        {
            RecordingId = recordingId,
            PrimaryLanguage = "en",
        };
        var createdTranscript = await client.Transcripts.CreateAsync(demoInteractionId, createTranscriptRequest);
        var transcriptId = createdTranscript.Id;

        var statusResponse = await client.Transcripts.GetStatusAsync(demoInteractionId, transcriptId);

        var getTranscript = await client.Transcripts.GetAsync(demoInteractionId, transcriptId);

        await client.Transcripts.DeleteAsync(demoInteractionId, transcriptId);
        await client.Recordings.DeleteAsync(demoInteractionId, recordingId);
        await client.Interactions.DeleteAsync(demoInteractionId);

        return Results.Ok(new
        {
            listTranscripts,
            createdTranscript = new { transcriptId = createdTranscript.Id },
            transcriptStatus = statusResponse,
            getTranscript,
            message = "List, create, get status, get, delete transcript and cleanup completed successfully",
        });
    }
    catch (CortiClientApiException ex)
    {
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

app.MapGet("/facts", async (IConfiguration config, string? token, string? interactionId) =>
{
    if (!TryCreateCortiClient(config, token, out var client, out var credentialError))
    {
        return credentialError;
    }

    try
    {
        if (!string.IsNullOrEmpty(interactionId))
        {
            var listResp = await client.Facts.ListAsync(interactionId);
            var facts = listResp.Facts?.ToList() ?? new List<FactsListItem>();
            return Results.Ok(new
            {
                interactionId,
                listCount = facts.Count,
                facts,
                message = "List facts completed successfully",
            });
        }

        var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var created = await client.Interactions.CreateAsync(new InteractionsCreateRequest
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
        var demoInteractionId = created.InteractionId;

        var factGroups = await client.Facts.FactGroupsListAsync();
        var listResp2 = await client.Facts.ListAsync(demoInteractionId);
        var listFacts = listResp2.Facts?.ToList() ?? new List<FactsListItem>();

        var createRequest = new FactsCreateRequest
        {
            Facts =
            [
                new FactsCreateInput { Text = "Patient has trouble breathing", Group = "history-of-present-illness" },
                new FactsCreateInput { Text = "Patient is experiencing chest pain", Group = "allergies" },
            ],
        };
        var createdFacts = await client.Facts.CreateAsync(demoInteractionId, createRequest);
        var firstFactId = createdFacts.Facts?.FirstOrDefault()?.Id;
        var secondFactId = createdFacts.Facts?.Skip(1).FirstOrDefault()?.Id;

        FactsUpdateResponse? updatedFact = null;
        if (!string.IsNullOrEmpty(firstFactId))
        {
            updatedFact = await client.Facts.UpdateAsync(demoInteractionId, firstFactId, new FactsUpdateRequest
            {
                Text = "Patient has severe trouble breathing",
                Source = CommonSourceEnum.User,
            });
        }

        FactsBatchUpdateResponse? batchUpdate = null;
        if (!string.IsNullOrEmpty(firstFactId) && !string.IsNullOrEmpty(secondFactId))
        {
            batchUpdate = await client.Facts.BatchUpdateAsync(demoInteractionId, new FactsBatchUpdateRequest
            {
                Facts =
                [
                    new FactsBatchUpdateInput { FactId = firstFactId, Text = "Patient has minor trouble breathing" },
                    new FactsBatchUpdateInput { FactId = secondFactId, Text = "Patient is experiencing severe chest pain" },
                ],
            });
        }

        var extractResponse = await client.Facts.ExtractAsync(new FactsExtractRequest
        {
            Context =
            [
                new CommonTextContext { Type = CommonTextContextType.Text, Text = "Patient reports headache and fever for two days. No known allergies." },
            ],
            OutputLanguage = "en",
        });

        await client.Interactions.DeleteAsync(demoInteractionId);

        return Results.Ok(new
        {
            factGroups,
            listFacts,
            createdFacts,
            updatedFact,
            batchUpdate,
            extractResponse,
            message = "Fact groups, list, create, update, batch update, extract and cleanup completed successfully",
        });
    }
    catch (CortiClientApiException ex)
    {
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

app.MapGet("/codes", async (IConfiguration config, string? token) =>
{
    if (!TryCreateCortiClient(config, token, out var client, out var credentialError))
    {
        return credentialError;
    }

    try
    {
        var predictResponse = await client.Codes.PredictAsync(new CodesGeneralPredictRequest
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
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

app.MapGet("/templates", async (IConfiguration config, string? token, string? key, string? org, string? lang, string? status) =>
{
    if (!TryCreateCortiClient(config, token, out var client, out var credentialError))
    {
        return credentialError;
    }

    try
    {
        if (!string.IsNullOrEmpty(key))
        {
            var template = await client.Templates.GetAsync(key);
            return Results.Ok(new
            {
                template,
                message = "Get template by key completed successfully",
            });
        }

        var listRequest = new TemplatesListRequest();
        if (!string.IsNullOrEmpty(org))
        {
            listRequest.Org = [org];
        }
        if (!string.IsNullOrEmpty(lang))
        {
            listRequest.Lang = [lang];
        }
        if (!string.IsNullOrEmpty(status))
        {
            listRequest.Status = [status];
        }

        var sectionListRequest = new TemplatesSectionListRequest();
        if (!string.IsNullOrEmpty(org))
        {
            sectionListRequest.Org = [org];
        }
        if (!string.IsNullOrEmpty(lang))
        {
            sectionListRequest.Lang = [lang];
        }

        var listResponse = await client.Templates.ListAsync(listRequest);
        var sectionListResponse = await client.Templates.SectionListAsync(sectionListRequest);
        var templates = listResponse.Data?.ToList() ?? new List<TemplatesItem>();

        TemplatesItem? templateByKey = null;
        if (templates.Count > 0 && !string.IsNullOrEmpty(templates[0].Key))
        {
            templateByKey = await client.Templates.GetAsync(templates[0].Key);
        }

        return Results.Ok(new
        {
            listCount = templates.Count,
            templates,
            sectionListCount = sectionListResponse.Data?.Count() ?? 0,
            sections = sectionListResponse.Data?.ToList() ?? new List<TemplatesSection>(),
            templateByKey,
            message = "List templates, list sections, and get by key completed successfully",
        });
    }
    catch (CortiClientApiException ex)
    {
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

app.MapGet("/agents", async (IConfiguration config, string? token, int? limit, int? offset, bool? ephemeral) =>
{
    if (!TryCreateCortiClient(config, token, out var client, out var credentialError))
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
        var listAgentsRaw = (await client.Agents.ListAsync(listRequest)).ToList();
        var createdAgent = await client.Agents.CreateAsync(new AgentsCreateAgent
        {
            Name = "SDK Example Agent",
            Description = "Example agent created via SDK for list and create demo.",
        });

        var getAgent = await client.Agents.GetAsync(createdAgent.Id);

        var agentCard = await client.Agents.GetCardAsync(createdAgent.Id);

        var registryExpertsResponse = await client.Agents.GetRegistryExpertsAsync(
            new AgentsGetRegistryExpertsRequest { Limit = 10, Offset = 0 }
        );
        var registryExpertsList = registryExpertsResponse.Experts?.ToList() ?? new List<AgentsRegistryExpert>();

        var messageSendResponse = await client.Agents.MessageSendAsync(
            createdAgent.Id,
            new AgentsMessageSendParams
            {
                Message = new AgentsMessage
                {
                    Role = AgentsMessageRole.User,
                    Parts = new List<AgentsPart>
                    {
                        AgentsPart.FromAgentsTextPart(
                            new AgentsTextPart
                            {
                                Kind = AgentsTextPartKind.Text,
                                Text = "Hello from SDK example",
                            }
                        ),
                    },
                    MessageId = $"msg-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                    Kind = AgentsMessageKind.Message,
                },
            }
        );

        AgentsTask? getTaskResult = null;
        AgentsContext? getContextResult = null;
        if (messageSendResponse.Task != null)
        {
            getTaskResult = await client.Agents.GetTaskAsync(
                createdAgent.Id,
                messageSendResponse.Task.Id,
                new AgentsGetTaskRequest()
            );
            getContextResult = await client.Agents.GetContextAsync(
                createdAgent.Id,
                messageSendResponse.Task.ContextId,
                new AgentsGetContextRequest()
            );
        }

        // PATCH /agents/{id} – commented out until endpoint works
        // var updatedAgent = await client.Agents.UpdateAsync(
        //     createdAgent.Id,
        //     new AgentsAgent
        //     {
        //         Id = createdAgent.Id,
        //         Name = "SDK Example Agent (updated)",
        //         Description = createdAgent.Description ?? "",
        //         SystemPrompt = createdAgent.SystemPrompt ?? "",
        //     }
        // );

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
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

app.MapGet("/documents", async (IConfiguration config, string? token, string? interactionId) =>
{
    if (!TryCreateCortiClient(config, token, out var client, out var credentialError))
    {
        return credentialError;
    }

    try
    {
        if (!string.IsNullOrEmpty(interactionId))
        {
            var listResp = await client.Documents.ListAsync(interactionId);
            var documents = listResp.Data?.ToList() ?? new List<DocumentsGetResponse>();
            return Results.Ok(new
            {
                interactionId,
                listCount = documents.Count,
                documents,
                message = "List documents completed successfully",
            });
        }

        var id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var created = await client.Interactions.CreateAsync(new InteractionsCreateRequest
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
        var demoInteractionId = created.InteractionId;

        var listResp2 = await client.Documents.ListAsync(demoInteractionId);
        var listDocuments = listResp2.Data?.ToList() ?? new List<DocumentsGetResponse>();

        var createBody = new DocumentsCreateRequestWithTemplateKey
        {
            Context =
            [
                new DocumentsContextWithFacts
                {
                    Type = DocumentsContextWithFactsType.Facts,
                    Data =
                    [
                        new FactsContext { Text = "Patient has trouble breathing", Source = CommonSourceEnum.Core },
                        new FactsContext { Text = "Patient is experiencing chest pain", Source = CommonSourceEnum.User },
                    ],
                },
            ],
            TemplateKey = "corti-patient-summary",
            OutputLanguage = "en",
            Name = "Patient Consultation Note",
        };
        var createdDocument = await client.Documents.CreateAsync(demoInteractionId, createBody);
        var documentId = createdDocument.Id;

        var retrievedDocument = await client.Documents.GetAsync(demoInteractionId, documentId);

        var updatedDocument = await client.Documents.UpdateAsync(
            demoInteractionId,
            documentId,
            new DocumentsUpdateRequest
            {
                Sections =
                [
                    new DocumentsSectionInput { Key = "chief-complaint", Text = "Patient reports severe trouble breathing and chest pain" },
                ],
            });

        await client.Documents.DeleteAsync(demoInteractionId, documentId);
        await client.Interactions.DeleteAsync(demoInteractionId);

        return Results.Ok(new
        {
            listDocuments,
            createdDocument,
            retrievedDocument,
            updatedDocument,
            message = "List, create, get, update, delete document and cleanup completed successfully",
        });
    }
    catch (CortiClientApiException ex)
    {
        return Results.Json(new { error = ex.Message, statusCode = ex.StatusCode, body = ex.Body }, statusCode: (int)ex.StatusCode);
    }
});

static bool TryCreateCortiClient(IConfiguration config, string? token, out CortiClient? client, out IResult errorResult)
{
    var resolvedToken = token ?? config["Corti:AccessToken"] ?? config["Corti:Token"];
    var tenantName = config["Corti:TenantName"];
    if (string.IsNullOrEmpty(tenantName) || string.IsNullOrEmpty(resolvedToken))
    {
        client = null;
        errorResult = Results.BadRequest(new { error = "Corti credentials required. Pass token as query parameter, or set Corti:TenantName and Corti:AccessToken in appsettings or environment." });
        return false;
    }
    var environment = string.Equals(config["Corti:Environment"], "us", StringComparison.OrdinalIgnoreCase)
        ? CortiClientEnvironment.Us
        : CortiClientEnvironment.Eu;
    client = new CortiClient(tenantName, resolvedToken, new ClientOptions { Environment = environment });
    errorResult = null!;
    return true;
}

static string? ResolveSampleFilePath(string contentRootPath, string fileName)
{
    var path = Path.Combine(contentRootPath, "sample", fileName);
    if (File.Exists(path))
    {
        return path;
    }
    path = Path.Combine(AppContext.BaseDirectory, "sample", fileName);
    return File.Exists(path) ? path : null;
}

static InteractionsListRequestSort? ParseSort(string? value)
{
    if (string.IsNullOrEmpty(value))
        return null;
    return value.ToLowerInvariant() switch
    {
        "id" => InteractionsListRequestSort.Id,
        "assigneduserid" => InteractionsListRequestSort.AssignedUserId,
        "patient" => InteractionsListRequestSort.Patient,
        "createdat" => InteractionsListRequestSort.CreatedAt,
        "endedat" => InteractionsListRequestSort.EndedAt,
        "updatedat" => InteractionsListRequestSort.UpdatedAt,
        _ => InteractionsListRequestSort.FromCustom(value),
    };
}

static CommonSortingDirectionEnum? ParseDirection(string? value)
{
    if (string.IsNullOrEmpty(value))
        return null;
    return value.ToLowerInvariant() switch
    {
        "asc" => CommonSortingDirectionEnum.Asc,
        "desc" => CommonSortingDirectionEnum.Desc,
        _ => CommonSortingDirectionEnum.FromCustom(value),
    };
}

static IEnumerable<InteractionsEncounterStatusEnum>? ParseEncounterStatus(string? value)
{
    if (string.IsNullOrEmpty(value))
        return null;
    var status = value.ToLowerInvariant() switch
    {
        "planned" => InteractionsEncounterStatusEnum.Planned,
        "inprogress" => InteractionsEncounterStatusEnum.InProgress,
        "onhold" => InteractionsEncounterStatusEnum.OnHold,
        "completed" => InteractionsEncounterStatusEnum.Completed,
        "cancelled" => InteractionsEncounterStatusEnum.Cancelled,
        "deleted" => InteractionsEncounterStatusEnum.Deleted,
        _ => (InteractionsEncounterStatusEnum?)null,
    };
    return status is { } s ? new[] { s } : null;
}

app.Run();
