# HumanAI

Electron and React setup co-pilot for guided hardware or environment setup workflows.

## About

HumanAI combines an Electron main process with a React renderer to guide users through mixed automation and human-verification checklists. The workflow is designed around software steps that can run automatically and human steps that require proof or confirmation.

## Key Features

- Checklist-driven setup flow
- Electron main-process orchestration
- React renderer for the user experience
- Optional camera-based proof capture
- Shared checklist schema in `shared/`

## Architecture

- `electron/` contains the main process, IPC, preload, and orchestrator code
- `src/` contains the renderer React app
- `shared/` contains checklist type definitions
- `dist-main/` and `dist-renderer/` are generated build outputs currently checked into the repo

## Tech Stack

- Electron
- React 18
- Vite
- TypeScript

## Prerequisites

- Node.js

## Installation

```bash
npm install
```

## Configuration

- `ELECTRON_DEV` is used by the dev scripts

## How to Run

```bash
npm run build:main
npm run build:renderer
npm run dev
```

## Example Usage

- Load a checklist from `electron/checklists/`
- Step through software and human verification tasks

## Project Structure

- `electron/checklists/` - JSON checklist definitions
- `electron/` - Electron runtime code
- `src/` - React renderer
- `shared/` - shared checklist schema

## Current Status

Functional prototype with a clear product idea, but it still includes generated build artifacts in the repo snapshot.

## Limitations

- Vision verification is stubbed
- Generated `dist-main/` and `dist-renderer/` files are checked in
- No repo-level license

## License

No explicit license file was found at the repository root.
