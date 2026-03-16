/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CORTI_ENVIRONMENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Declare the custom element for TypeScript
declare namespace JSX {
  interface IntrinsicElements {
    "corti-embedded": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        baseUrl?: string;
        visibility?: "visible" | "hidden";
      },
      HTMLElement
    >;
  }
}
