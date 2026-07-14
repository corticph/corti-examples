import { Outlet } from "react-router-dom";
import { EndpointSidebar } from "../components/EndpointSidebar";

// Two-pane layout for the endpoints surface: sticky sidebar on the left, content on the right.
// Each pane scrolls independently so a long endpoint form doesn't lose the sidebar.
export function EndpointsLayout() {
  return (
    <div className="flex">
      <EndpointSidebar />
      <main className="min-w-0 flex-1 px-6 py-8">
        {/* Roomy max-width keeps the form readable on big monitors without letting
            inputs stretch into ergonomic-disaster territory on ultrawides. */}
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
