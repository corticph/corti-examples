import { useEffect, useState } from "react";
import AgentChatView from "./AgentChatView.jsx";
import AgentSetupView from "./AgentSetupView.jsx";
import AuthView from "./AuthView.jsx";
import { onUnauthorized, startChat } from "./api.js";
import ClinicianSignInView from "./ClinicianSignInView.jsx";
import PatientPanelView from "./PatientPanelView.jsx";
import UploadView from "./UploadView.jsx";

export default function App() {
  const [authed, setAuthed] = useState(false); // connected to Corti
  const [agent, setAgent] = useState(null); // the orchestrator (detected or created)
  const [clinician, setClinician] = useState(null); // signed-in clinician
  const [chatting, setChatting] = useState(false); // Start chat pressed
  const [uploading, setUploading] = useState(false); // Upload document pressed
  const [starting, setStarting] = useState(false); // warm-up/pre-bind in progress
  const [startError, setStartError] = useState("");
  const [chatContextId, setChatContextId] = useState(""); // pre-bound context for the chat

  // Start chat: warm up + pre-bind the context, then enter the chat with it.
  async function handleStartChat() {
    if (starting) {
      return;
    }
    setStarting(true);
    setStartError("");
    try {
      const { contextId } = await startChat(agent.id);
      setChatContextId(contextId);
      setChatting(true);
    } catch (err) {
      setStartError(err.message);
    } finally {
      setStarting(false);
    }
  }

  // Full disconnect: back to the Corti connect screen.
  function disconnect() {
    setAuthed(false);
    setAgent(null);
    setClinician(null);
    setChatting(false);
  }
  // Clinician sign-out: keep Corti + agent, return to the clinician picker.
  function signOut() {
    setClinician(null);
    setChatting(false);
    setUploading(false);
  }

  useEffect(() => {
    onUnauthorized(() => disconnect());
  }, []);

  let view;
  if (!authed) {
    view = <AuthView onAuth={() => setAuthed(true)} />;
  } else if (!agent) {
    view = <AgentSetupView onReady={setAgent} onDisconnect={disconnect} />;
  } else if (!clinician) {
    view = <ClinicianSignInView onSignIn={setClinician} onDisconnect={disconnect} />;
  } else if (uploading) {
    view = <UploadView clinician={clinician} onBack={() => setUploading(false)} />;
  } else if (chatting) {
    view = (
      <AgentChatView
        agent={agent}
        clinician={clinician}
        initialContextId={chatContextId}
        onBack={() => setChatting(false)}
      />
    );
  } else {
    view = (
      <PatientPanelView
        clinician={clinician}
        onStartChat={handleStartChat}
        starting={starting}
        startError={startError}
        onUpload={() => setUploading(true)}
        onSignOut={signOut}
      />
    );
  }

  return view;
}
