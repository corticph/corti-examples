# Dictation Commands

This folder contains example dictation command catalogs for use with Corti Symphony. Each file defines a set of commands that can be registered in the `/transcribe` WebSocket configuration and detected during dictation.

## Directory Layout

- `en/` — English command catalogs
  - `auto-text.json` — Insert templates and macro-text 
  - `dictation-box.json` — Dictation box controls
  - `editing.json` — Edit actions and formatting
  - `lists.json` — List creation and navigation
  - `navigation.json` — Cursor and field navigation
  - `roman-numerals.json` — Roman numeral insertion
  - `select.json` — Selection controls

## Using Commands in `/transcribe`

Commands are provided in the WebSocket `config` message under `configuration.commands` as an array of command objects.

Each command object contains:

- `id` (string, required): Unique identifier returned when the command is detected.
- `phrases` (string[], required): One or more spoken phrases that trigger the command.
- `variables` (array, optional): Placeholder definitions used in phrases. Each variable has:
  - `key` (string, required)
  - `type` (`enum`, required)
  - `enum` (string[], required)

Phrases may use `{variable_name}` placeholders that map to `variables.key`, with values constrained to the `enum` list.

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

## Command Responses

When a command is detected, the server sends a WebSocket message of type `"command"` with `data` containing:

- `id`
- `variables` (object of resolved variable values)
- `rawTranscriptText`
- `start` / `end` timestamps

Transcript `text` has command phrases removed, while command events include the spoken command in `rawTranscriptText`.

## See Also

- [Real-time stateless dictation — `/transcribe` (commands config + command responses)](https://docs.corti.ai/api-reference/transcribe)
