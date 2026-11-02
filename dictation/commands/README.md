# Dictation Commands

This folder contains example dictation command catalogs for use with Corti Symphony. Each file defines a set of commands that can be registered in the `/transcribe` WebSocket configuration and detected during dictation.

## Directory Layout

Command catalogs are organized by language, with the same set of files in each folder:

- `en/` — English command catalogs
- `de/` — German command catalogs
- `fr/` — French command catalogs

Files in each language folder:

- `auto-text.json` — Insert templates, macro-text, and Epic SmartPhrases
- `dictation-box.json` — Dictation box controls
- `editing.json` — Edit actions and formatting
- `lists.json` — List creation and navigation
- `navigation.json` — Cursor and field navigation
- `select.json` — Selection controls
- `wildcard.json` — Commands using wildcard (open-ended) variables

## Using Commands in `/transcribe`

Commands are provided in the WebSocket `config` message under `configuration.commands` as an array of command objects.

Each command object contains:

- `id` (string, required): Unique identifier returned when the command is detected.
- `phrases` (string[], required): One or more spoken phrases that trigger the command.
- `variables` (array, optional): Placeholder definitions used in phrases. Each variable has:
  - `key` (string, required)
  - `type` (`enum` or `wildcard`, required)
  - `enum` (string[], required when `type` is `enum`)

Phrases may use `{variable_name}` placeholders that map to `variables.key`. With `enum` variables, recognized values are constrained to the `enum` list; with `wildcard` variables, open-ended spoken text is captured.

### Example Configuration

```json
{
  "type": "config",
  "configuration": {
    "primaryLanguage": "en",
    "interimResults": true,
    "spokenPunctuation": true,
    "commands": [
      {
        "id": "next_section",
        "phrases": ["next section", "go to next section"]
      },
      {
        "id": "insert_template",
        "phrases": [
          "insert my {template_name} template",
          "insert {template_name} template"
        ],
        "variables": [
          {
            "key": "template_name",
            "type": "enum",
            "enum": ["soap", "radiology", "referral"]
          }
        ]
      }
    ]
  }
}
```

### Wildcard Variables

Unlike `enum` variables, `wildcard` variables capture open-ended spoken text instead of a predefined list:

```json
{
  "id": "select_text",
  "phrases": ["select {text}"],
  "variables": [{ "key": "text", "type": "wildcard" }]
}
```

Constraints when using `wildcard` variables:

- A phrase may not begin with a wildcard variable — a literal trigger word (e.g., "select") must precede it.
- Multiple wildcard variables in a single phrase must be separated by a non-empty literal string.
- Do not set an `enum` list on a wildcard variable.
- Recognition requires about 1.5 seconds of silence before and after the command phrase.
- A wildcard captures a maximum of 10 words; once the cap is reached without a following literal endpoint, the command fires with the accumulated words.
- Commands with wildcard variables are recognized after commands with `enum` variables, so enum-based commands take priority when phrases overlap.

See `wildcard.json` in each language folder for simple (`select {text}`), literal-endpoint (`select {utterance} end select`), and mixed enum + wildcard (`insert {direction} {word}`) examples.

## Command Responses

When a command is detected, the server sends a WebSocket message of type `"command"` with `data` containing:

- `id`
- `variables` (object of resolved variable values)
- `rawTranscriptText`
- `start` / `end` timestamps

Transcript `text` has command phrases removed, while command events include the spoken command in `rawTranscriptText`.

## See Also

- [Commands documentation](https://docs.corti.ai/stt/commands)
- [Commands tips and examples](https://docs.corti.ai/stt/best-practices-commands)
- [Real-time stateless dictation — `/transcribe` (commands config + command responses)](https://docs.corti.ai/api-reference/transcribe)
