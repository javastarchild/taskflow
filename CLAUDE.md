# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Dev server at http://localhost:3000 (hot reload)
npm test         # Run tests in watch mode (Jest + React Testing Library)
npm test -- --watchAll=false  # Run tests once (CI mode)
npm run build    # Production build to /build
```

## Architecture

Standard Create React App structure with React 19. Entry point is `src/index.js`, which mounts `<App />` into `public/index.html#root`.

All application logic lives in `src/App.js`. Tests use `@testing-library/react` — assert on rendered output, not implementation details.

No routing, state management, or backend — this is a single-page static app.
