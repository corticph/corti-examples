# Corti Ambient Web Component — Demos

Interactive demos for [`@corti/ambient-web`](https://www.npmjs.com/package/@corti/ambient-web). Each demo is a standalone HTML page served by a small Express server that creates an interaction and mints a `streams`-scoped token — credentials stay on the server.

## Demos

| File | Description |
| --- | --- |
| [basic-demo.html](basic-demo.html) | `<corti-ambient>` with built-in UI; transcript and facts appended below |
| [custom-ui-demo.html](custom-ui-demo.html) | Hidden component; custom record button, device/language selectors, level meter |
| [styling-demo.html](styling-demo.html) | CSS custom properties and light/dark `color-scheme` |
| [refresh-demo.html](refresh-demo.html) | `authConfig.refreshAccessToken` calling `/api/token` |

## Quick start

```sh
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:3000

## Server endpoints

| Endpoint | Description |
| --- | --- |
| `POST /api/start-session` | Creates an interaction; returns `{ interactionId, accessToken }` |
| `POST /api/token` | Fresh streams-scoped token (refresh demo) |

The component is loaded from jsDelivr (`@corti/ambient-web/dist/bundle.js`). Pin the version in the demo HTML if you need a specific prerelease.
