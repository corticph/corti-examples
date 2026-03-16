# Corti Example Applications

This repository contains example applications for Corti products, organized by product and then by language or framework. Each example is a self-contained project with its own README.

## Prerequisites

- A **Corti account** and API credentials from [Corti Console](https://console.corti.app). Each example’s README lists which credentials (tenant name, client ID, client secret, etc.) to set.

## Structure

| Product            | Language/Framework | Example                                                                          | Description                                                                                          |
| ------------------ | ------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SDK                | TypeScript         | [express-web-api](sdk/typescript/express-web-api/)                                | Express REST API: token (client credentials, ROPC, auth code, PKCE), interactions, recordings, transcripts, facts, codes, templates, agents, documents, stream and transcribe WebSockets. |
| SDK                | TypeScript         | [next-auth-examples](sdk/typescript/next-auth-examples/)                          | Next.js app with four auth flows (client credentials, ROPC, authorization code, PKCE). Forms for credentials; success view shows token and interactions. |
| SDK                | .NET               | [web-api](sdk/dotnet/web-api/)                                                   | ASP.NET Core web API: same scope as Express (token flows, interactions, recordings, transcripts, facts, codes, templates, agents, documents, stream, transcribe). Uses [Corti.Sdk](https://www.nuget.org/packages/Corti.Sdk). |
| Embedded Assistant | React              | [basic-example](embedded-assistant/react/basic-example/)      | Basic React example for Embedded Assistant.                                                          |
| Embedded Assistant | Vanilla TypeScript | [basic-example](embedded-assistant/vanilla-ts/basic-example/) | Basic Vanilla TypeScript example for Embedded Assistant.                                             |

Additional products and languages/frameworks will be added as new top-level and subdirectories.

## Getting started

Open the directory for the product, language, and project you want (e.g., [sdk/typescript/express-web-api/](sdk/typescript/express-web-api/) for the SDK Express web API, [sdk/dotnet/web-api/](sdk/dotnet/web-api/) for the SDK .NET web API, or [embedded-assistant/react/basic-example/](embedded-assistant/react/basic-example/) for the Embedded Assistant React example) and follow that project's README.
