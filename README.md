# Arcium Blind Auction

Private sealed-bid auction built on Solana devnet with Arcium integration.

## What this project is

This repository contains a Next.js application, an Anchor program, and Arcium encrypted instruction definitions for a privacy-oriented auction workflow.

The project demonstrates:

- auction creation on Solana devnet
- encrypted bid preparation using Arcium client primitives
- Arcium account derivation and computation-definition-aware submission flow
- auction finalization and outcome display
- app-side metadata persistence across refreshes

## Stack

- Next.js 15
- React 19
- Tailwind CSS
- Solana Web3.js
- Anchor
- Arcium client SDK

## Main directories

```text
src/
├── app/                  # Next.js App Router pages and API routes
├── components/           # UI components
├── idl/                  # Client-consumed Anchor IDL
└── utils/                # Solana, Arcium, and app utilities

encrypted-ixs/            # Arcium encrypted instruction definitions
programs/auction/         # Anchor program
scripts/                  # Computation definition setup scripts
data/                     # Local metadata store
tests/                    # Anchor tests
```

## Important files

- `src/app/App.jsx` - main auction workspace
- `src/app/guide/page.jsx` - detailed project guide
- `src/app/api/encryption/route.js` - Arcium account derivation and bid encryption
- `src/app/api/auctions/route.js` - metadata, bids, and resolution storage API
- `src/utils/programInstructions.js` - client-side Anchor instruction calls
- `programs/auction/src/lib.rs` - on-chain auction program
- `encrypted-ixs/src/lib.rs` - encrypted instruction definitions

## Local development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Start production mode:

```bash
npm start
```

## Arcium workflow commands

Initialize computation definitions:

```bash
npm run arcium:init-comp-defs
```

Finalize or upload computation definitions:

```bash
npm run arcium:finalize-comp-defs
```

## Environment

Typical environment variables used by the app include:

- `NEXT_PUBLIC_PROGRAM_ID`
- `PROGRAM_ID`
- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `SOLANA_RPC_URL`
- `CLUSTER_OFFSET`
- `NEXT_PUBLIC_ENCRYPTION_API_BASE_URL`
- `NEXT_PUBLIC_AUCTIONS_API_BASE_URL`

## Notes on structure

This project uses `src/app`, which is a normal Next.js layout. The `src` folder is simply the source root; it does not mean the project is still a plain React app.

If you want a fuller explanation of the implementation and Arcium’s role, open:

- `/guide` in the running app
- `PROJECT_GUIDE.mdx`

## License

MIT
