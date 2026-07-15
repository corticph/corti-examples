import { Navigate, Route, Routes } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { EndpointPage } from "./pages/EndpointPage";
import { EndpointsCatalog } from "./pages/EndpointsCatalog";
import { EndpointsLayout } from "./pages/EndpointsLayout";
import { ProfileEditPage } from "./pages/ProfileEditPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { WorkflowEditPage } from "./pages/WorkflowEditPage";
import { WorkflowsListPage } from "./pages/WorkflowsListPage";

// Each page chooses its own width: most pages center themselves with mx-auto max-w-*,
// but the endpoints layout is full-width because it owns a left sidebar.
function CenteredPage({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>;
}

export default function App() {
  return (
    <div className="min-h-screen bg-paper-muted text-ink font-sans">
      <TopBar />
      <Routes>
        <Route path="/" element={<Navigate to="/endpoints" replace />} />
        <Route path="/endpoints" element={<EndpointsLayout />}>
          <Route index element={<EndpointsCatalog />} />
          <Route path=":id" element={<EndpointPage />} />
        </Route>
        <Route
          path="/profiles"
          element={
            <CenteredPage>
              <ProfilesPage />
            </CenteredPage>
          }
        />
        <Route
          path="/profiles/new"
          element={
            <CenteredPage>
              <ProfileEditPage mode="new" />
            </CenteredPage>
          }
        />
        <Route
          path="/profiles/:id"
          element={
            <CenteredPage>
              <ProfileEditPage mode="edit" />
            </CenteredPage>
          }
        />
        <Route
          path="/workflows"
          element={
            <CenteredPage>
              <WorkflowsListPage />
            </CenteredPage>
          }
        />
        {/* Workflow editor is full-bleed — it owns a left sidebar and a bottom edit panel,
            and needs every available pixel for the ReactFlow canvas. */}
        <Route path="/workflows/:id" element={<WorkflowEditPage />} />
        <Route path="*" element={<Navigate to="/endpoints" replace />} />
      </Routes>
    </div>
  );
}
