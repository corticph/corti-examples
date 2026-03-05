import { use, Suspense } from "react";
import { EmbeddedAssistant } from "./components/EmbeddedAssistant";
import { fetchAuthToken, fetchConfig } from "./lib/auth";
import type { AuthResponse, ConfigResponse } from "./types";
import "./App.css";

interface AppWithDataProps {
  configPromise: Promise<ConfigResponse>;
  authPromise: Promise<AuthResponse>;
}

function AppWithData({ configPromise, authPromise }: AppWithDataProps) {
  const config = use(configPromise);
  const authData = use(authPromise);

  if (authData.error) {
    return (
      <div className="container">
        <div className="status error">
          <strong>Authentication Error:</strong>{" "}
          {authData.message || "Failed to get authentication token"}
        </div>
      </div>
    );
  }

  return <EmbeddedAssistant baseUrl={config.baseUrl} authData={authData} />;
}

function App() {
  return (
    <Suspense
      fallback={
        <div className="container">
          <div className="status loading">Loading configuration...</div>
        </div>
      }
    >
      <AppWithData
        configPromise={fetchConfig()}
        authPromise={fetchAuthToken()}
      />
    </Suspense>
  );
}

export default App;
