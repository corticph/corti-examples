# Corti Example Applications

This repository contains example applications for Corti products, organized first by product (e.g., SDK, API, Embedded Assistant), and then by language or framework. Each product has its own top-level directory, and each language/framework is a separate, self-contained project within that product.

## Structure

| Product            | Language/Framework | Example                                                                          | Description                                                                                          |
| ------------------ | ------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SDK                | TypeScript         | [express-web-api](sdk/typescript/express-web-api/)                                | Express API with same endpoints as .NET web-api (token, interactions, recordings, transcripts, facts, codes, templates, agents, documents). |
| SDK                | .NET               | [web-api](sdk/dotnet/web-api/)                                                   | ASP.NET Core web API with SDK call examples (token, interactions, recordings, transcripts, facts, etc.). |
| Embedded Assistant | React              | [basic-example](embedded-assistant/embedded-assistant/react/basic-example/)      | Basic React example for Embedded Assistant.                                                          |
| Embedded Assistant | Vanilla TypeScript | [basic-example](embedded-assistant/embedded-assistant/vanilla-ts/basic-example/) | Basic Vanilla TypeScript example for Embedded Assistant.                                             |

Additional products and languages/frameworks will be added as new top-level and subdirectories.

## Getting started

Open the directory for the product, language, and project you want (e.g., [sdk/typescript/express-web-api/](sdk/typescript/express-web-api/) for the SDK Express web API, [sdk/dotnet/web-api/](sdk/dotnet/web-api/) for the SDK .NET web API, or [embedded-assistant/embedded-assistant/react/basic-example/](embedded-assistant/embedded-assistant/react/basic-example/) for the Embedded Assistant React example) and follow that project’s README.
