import type { SetInteractionOptionsPayload } from "@/lib/corti-assistant-embedded-payloads";

declare module "@corti/embedded-web" {
  interface CortiEmbeddedAPI {
    setInteractionOptions(config: SetInteractionOptionsPayload): Promise<void>;
  }

  interface CortiEmbeddedV1API {
    setInteractionOptions(payload: SetInteractionOptionsPayload): Promise<void>;
  }
}
