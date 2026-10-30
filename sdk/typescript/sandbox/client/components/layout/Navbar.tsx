import { ExternalLink, LayoutDashboard, Minimize2, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { Logo } from "../Logo";
import { Button } from "../ui/button";

export function Navbar({ label, onExit }: { label?: string; onExit?: () => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <nav className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-8">
      <div className="flex items-center gap-7">
        <Link
          to="/"
          className="flex items-center no-underline"
          aria-label="Corti SDK Sandbox — home"
        >
          <Logo className="h-7 w-auto text-foreground" />
        </Link>
        {label && (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">{label}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle dark mode"
          aria-label="Toggle dark mode"
          className="flex items-center rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {onExit ? (
          <Button variant="outline" size="sm" type="button" onClick={onExit}>
            <Minimize2 className="h-3.5 w-3.5" />
            Exit full screen
          </Button>
        ) : (
          <>
            <a
              href="https://console.corti.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden md:inline">Console</span>
            </a>
            <a
              href="https://docs.corti.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden md:inline">API docs</span>
            </a>
          </>
        )}
      </div>
    </nav>
  );
}
