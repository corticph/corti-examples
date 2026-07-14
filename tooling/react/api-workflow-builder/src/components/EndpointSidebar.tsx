import { useNavigate, useParams } from "react-router-dom";
import { EndpointPicker } from "./EndpointPicker";

// Route-level sidebar shell. The actual search + group list lives in EndpointPicker so
// the same component can be reused inside the workflow editor's add-node panel.
export function EndpointSidebar() {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const activeId = routeId ? decodeURIComponent(routeId) : undefined;

  return (
    <aside className="sticky top-0 hidden h-[calc(100vh-57px)] w-72 shrink-0 overflow-y-auto border-r border-muted-300/40 bg-paper md:block">
      <EndpointPicker
        activeId={activeId}
        storageKey="endpoints.sidebar.expanded"
        onPick={(id) => navigate(`/endpoints/${encodeURIComponent(id)}`)}
      />
    </aside>
  );
}
