import { agents } from "./agents";
import { codes } from "./codes";
import { documents } from "./documents";
import { facts } from "./facts";
import { guidedSections } from "./guidedSections";
import { guidedTemplates } from "./guidedTemplates";
import { interactions } from "./interactions";
import { recordings } from "./recordings";
import { streams } from "./streams";
import { transcribe } from "./transcribe";
import { transcripts } from "./transcripts";
import type { EndpointDef } from "./types";

export const endpointGroups: { name: string; endpoints: EndpointDef[] }[] = [
  { name: "Interactions", endpoints: interactions },
  { name: "Recordings", endpoints: recordings },
  { name: "Transcripts", endpoints: transcripts },
  { name: "Streams", endpoints: streams },
  { name: "Transcribe", endpoints: transcribe },
  { name: "Documents", endpoints: documents },
  { name: "Facts", endpoints: facts },
  { name: "Coding", endpoints: codes },
  { name: "Agents", endpoints: agents },
  { name: "Guided Templates", endpoints: guidedTemplates },
  { name: "Guided Sections", endpoints: guidedSections },
];

export const allEndpoints: EndpointDef[] = endpointGroups.flatMap((g) => g.endpoints);

export const endpointById: Record<string, EndpointDef> = Object.fromEntries(
  allEndpoints.map((e) => [e.id, e]),
);
