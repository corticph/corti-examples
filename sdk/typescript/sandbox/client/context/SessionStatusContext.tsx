import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

export interface SessionStatus {
  /** Corti /transcribe session id, read off the CONFIG_ACCEPTED message. */
  sessionId?: string;
  /** Interaction id backing a /streams connection or a REST /transcripts run. */
  interactionId?: string;
}

interface SessionStatusContextValue {
  status: SessionStatus;
  /** Merges into the current status — callers only touch the field(s) they own. */
  setStatus: (patch: SessionStatus) => void;
  clear: () => void;
}

const SessionStatusContext = createContext<SessionStatusContextValue | null>(null);

/**
 * Lets whichever applet is currently active publish its live session/interaction
 * id up to the shared footer in AppLayout, which lives outside the routed page
 * tree. Purely for troubleshooting — the id is what support needs to pull server
 * logs for a session, so it's shown regardless of which endpoint the applet uses.
 */
export function SessionStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<SessionStatus>({});

  const setStatus = useCallback((patch: SessionStatus) => {
    setStatusState((prev) => ({ ...prev, ...patch }));
  }, []);

  const clear = useCallback(() => setStatusState({}), []);

  return (
    <SessionStatusContext.Provider value={{ status, setStatus, clear }}>
      {children}
    </SessionStatusContext.Provider>
  );
}

const NOOP_SESSION_STATUS: SessionStatusContextValue = {
  status: {},
  setStatus: () => {},
  clear: () => {},
};

/**
 * Outside a provider this is a no-op, so the shared web-component wrappers
 * keep working when copied into an app that has no session footer.
 */
export function useSessionStatus(): SessionStatusContextValue {
  return useContext(SessionStatusContext) ?? NOOP_SESSION_STATUS;
}
