# Corti SDK Hackathon Examples

This repository provides minimal, working examples of how to use the alpha version of `@corti/sdk` in a Next.js app. It
is designed for hackathon participants and developers who want to quickly try out simple operations and authentication
flows with the Corti SDK. The code is intentionally basic, focusing on simply working rather than production
readiness and actual workflows.

## Getting Started

1. **Obtain Credentials**
    - Go to the Corti self-service portal and generate the required credentials for the SDK and API usage.

2. **Create Environment File**
    - In the `sdk/typescript/next/` directory, create a file named `.env.local`.
    - Copy the contents of `.env.example` and fill in the required values.

3. **Install Dependencies** (from the `sdk/typescript/next/` directory)
   ```bash
   cd sdk/typescript/next && npm install
   ```

4. **Run the Development Server**
   ```bash
   npm run dev
   ```
   The app will be available at [http://localhost:3000](http://localhost:3000).

## Project Structure & Where to Look

- **Frontend Auth Flows**: Two different authentication flows are implemented for the frontend. Check `src/app/page.tsx` and `src/common/AuthContext` for the implementation.
- **Examples** (all paths relative to this `sdk/typescript/next/` directory):
    - **Frontend**: Example pages are under `src/app/examples/` (e.g., `documents`, `facts`, `interactions`, etc.).
    - **API**: Example API endpoints are under `src/app/api/examples/`.
- **Auth Endpoints**: Endpoints used for frontend authentication examples are in `src/app/api/frontend-endpoints/`.

## How Routing Works in Next.js

This project uses the [App Router](https://nextjs.org/docs/app/building-your-application/routing) from Next.js, which means:

- **Frontend Pages**: Each folder inside `src/app/examples/` corresponds to a route. For example:
  - `src/app/examples/documents/page.tsx` is available at `/examples/documents`
  - `src/app/examples/facts/page.tsx` is available at `/examples/facts`
  - And so on for other examples
- **API Endpoints**: Each file in `src/app/api/examples/` is available as an API route. For example:
  - `src/app/api/examples/documents/route.ts` is available at `/api/examples/documents`
  - `src/app/api/examples/facts/route.ts` is available at `/api/examples/facts`
  - And so on for other API examples

To launch a frontend example, first authenticate at the root URL (`http://localhost:3000/`) by clicking one of the authentication buttons. Once authenticated, you can navigate to any example page (e.g., `http://localhost:3000/examples/documents`). For API examples, you can navigate directly to the endpoints (e.g., `/api/examples/documents`).

For more details, see the [Next.js Routing documentation](https://nextjs.org/docs/app/building-your-application/routing).
