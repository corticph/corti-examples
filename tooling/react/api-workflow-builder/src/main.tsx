import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ProfilesProvider } from "./context/ProfilesContext";
import { WorkflowsProvider } from "./workflows/context";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProfilesProvider>
        <WorkflowsProvider>
          <App />
        </WorkflowsProvider>
      </ProfilesProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
