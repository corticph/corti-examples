import "./global.css";

import { Toaster as Sonner } from "client/components/ui/sonner";
import { TooltipProvider } from "client/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AuthProvider } from "./context/AuthContext";
import { SessionStatusProvider } from "./context/SessionStatusContext";
import { AppletFullscreen } from "./pages/AppletFullscreen";
import { AppletPage, Home } from "./pages/Home";
import NotFound from "./pages/NotFound";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <SessionStatusProvider>
          <BrowserRouter>
            <Routes>
              {/* Standalone full-viewport demo — no docs shell */}
              <Route path="/:workflow/:applet/fullscreen" element={<AppletFullscreen />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/:workflow/:applet" element={<AppletPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </SessionStatusProvider>
      </AuthProvider>
    </TooltipProvider>
  </ThemeProvider>
);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}
createRoot(rootElement).render(<App />);
