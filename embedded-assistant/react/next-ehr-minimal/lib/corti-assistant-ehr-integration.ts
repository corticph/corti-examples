import type {
  CortiEmbeddedReactRef,
  UseCortiEmbeddedApiResult,
} from "@corti/embedded-web/react";

import type { CortiAssistantInteractionData } from "@/components/corti-assistant-types";
import type {
  SetInteractionOptionsPayload,
} from "@/lib/corti-assistant-embedded-payloads";
import type { CortiAssistantVisitConfig } from "@/lib/corti-assistant-visit-config";

type CortiAssistantAuthPayload = Parameters<UseCortiEmbeddedApiResult["auth"]>[0];

type ConnectCortiAssistantToEhrParams = {
  api: UseCortiEmbeddedApiResult;
  authData: CortiAssistantAuthPayload;
  corti: CortiEmbeddedReactRef;
  interactionData: CortiAssistantInteractionData;
  visitConfig: CortiAssistantVisitConfig;
};

export const CORTI_ASSISTANT_RECOVERY_MESSAGE =
  "Assistant is taking longer than expected to load. Check your connection, then try again.";

export function getCortiAssistantErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function startCortiAssistantSession({
  api,
  authData,
  corti,
  interactionData,
  visitConfig,
}: ConnectCortiAssistantToEhrParams) {
  corti.hide();

  await api.auth(authData);
  await api.configureApp({ ui: { interactionTitle: false } });
  await api.setInteractionOptions(buildSoapInteractionOptions(visitConfig.templateId));
  const interaction = await api.createInteraction(interactionData);
  await api.addFacts(visitConfig.patientFacts);
  await api.navigate({ path: `/session/${interaction.id}` });
  corti.show();

  return interaction;
}

function buildSoapInteractionOptions(templateId: string): SetInteractionOptionsPayload {
  return {
    spokenLanguage: {
      options: ["en"],
    },
    templates: {
      defaultTemplate: {
        behaviour: "force-first-document",
        template: {
          source: "standard",
          id: templateId,
        },
        allowUserSelection: false,
      },
    },
    documents: {
      actions: { sync: true },
      maxGenerated: 1,
      allowedLanguages: ["en"],
    },
  };
}
