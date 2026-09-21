type DefaultMode = "virtual" | "in-person";

export interface InteractionModeOptions {
  fallback?: DefaultMode;
  options: DefaultMode[];
}

export interface SpokenLanguageOptions {
  fallback?: string;
  options?: string[];
}

export interface InteractionTemplateReference {
  source: "standard";
  id: string;
}

export interface DefaultInteractionTemplateOptions {
  behaviour?: "fallback" | "force-first-document";
  template?: InteractionTemplateReference;
  allowUserSelection?: boolean;
}

export interface InteractionTemplateSources {
  standard?: {
    enabled?: boolean;
    include?: {
      regions?: string[];
      families?: string[];
    };
  };
}

export interface InteractionTemplateOptions {
  sources?: InteractionTemplateSources;
  defaultTemplate?: DefaultInteractionTemplateOptions;
}

export interface InteractionDocumentOptions {
  actions?: {
    sync?: boolean;
  };
  allowedLanguages?: string[];
  maxGenerated?: number | "unlimited";
}

export interface SetInteractionOptionsPayload {
  mode?: InteractionModeOptions;
  spokenLanguage?: SpokenLanguageOptions;
  templates?: InteractionTemplateOptions;
  documents?: InteractionDocumentOptions;
}
