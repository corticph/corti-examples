# Next EHR Minimal

A minimal Next.js application with a stable, production-ready stack.

## Stack

- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Utility-first styling
- **Vitest** - Fast unit testing framework
- **ESLint** - Code linting
- **Turbopack** - Fast bundler for development

## Getting Started

### Environment Setup

Create a local env file before starting the app:

```bash
cp .env.example .env
```

Current variables:

- `EHR_SQLITE_PATH` - Server-only path to the local SQLite database file.

### Install Dependencies

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Testing

Run tests in watch mode:

```bash
npm test
```

Run tests once:

```bash
npm run test:run
```

Run tests with UI:

```bash
npm run test:ui
```

### Build

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm start
```

### Linting

```bash
npm run lint
```

## Project Structure

```
next-ehr-minimal/
├── app/
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   ├── page.test.tsx     # Home page tests
│   └── globals.css       # Global styles
├── public/               # Static assets
├── vitest.config.ts      # Vitest configuration
├── vitest.setup.ts       # Test setup
├── tailwind.config.ts    # Tailwind configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```

## Brand Guidelines

See [brand.md](./brand.md) for the Corti design system guidelines.
