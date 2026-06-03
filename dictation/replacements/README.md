# Replacement Rules 

This folder contains example transcript replacement catalogs for use with Corti Symphony. Each file defines a set of `replacements` that can be registered in the `/transcribe` WebSocket configuration to rewrite final transcript text after speech recognition.

## Directory Layout

- `en/` — English replacement catalogs
  - `numbered-list.json` — Convert spoken list starters into numbered list prefixes, using ordinal adverb form (e.g., "firstly") to not conflict with common general dictation words (e.g., "first")
  - `roman-numerals.json` — Convert spoken "Roman numeral ..." phrases into Roman numerals
- `de/` — German replacement catalogs
  - `numbered-list.json` — Convert spoken list starters into numbered list prefixes, using ordinal adverb form to not conflict with common general dictation words 
  - `roman-numerals.json` — Convert spoken "Römisch ..." phrases into Roman numerals
- `fr/` — French replacement catalogs
  - `numbered-lists.json` — Convert spoken list starters into numbered list prefixes, using ordinal adverb form to not conflict with common general dictation words 
  - `roman-numerals.json` — Convert spoken "Numéro romain ..." phrases into Roman numerals

## Using Replacements in `/transcribe`

Replacements are provided in the WebSocket `config` message under `configuration.replacements` as an array of replacement objects.

Each replacement object contains:

- `find` (string, required): Speech-to-text output to replace.
- `replace` (string, required): Replacement text to use in final transcript output.

Replacements can target single words, acronyms, or multi-word phrases. They are applied to final transcript text output, and the API currently enforces a maximum of 1,000 replacement items per configuration.

The example JSON files in this folder are complete `config` payloads. You can either send them as-is or copy only the `configuration.replacements` array into a larger `/transcribe` configuration.

### Example Configuration

```json
{
  "type": "config",
  "configuration": {
    "primaryLanguage": "en",
    "spokenPunctuation": true,
    "replacements": [
      { "find": "firstly", "replace": "1." },
      { "find": "secondly", "replace": "2." },
      { "find": "Roman numeral four", "replace": "iv" },
      { "find": "BID", "replace": "twice daily" }
    ]
  }
}
```

## Typical Use Cases

- Convert spoken list markers into numbered lists
- Normalize Roman numerals for exams, classifications, or outlines
- Expand or restyle abbreviations, acronyms, or preferred phrases in the final transcript

## See Also

- [Transcript replacements](https://docs.corti.ai/stt/replacements)
- [Real-time stateless dictation — `/transcribe` configuration](https://docs.corti.ai/api-reference/transcribe)
