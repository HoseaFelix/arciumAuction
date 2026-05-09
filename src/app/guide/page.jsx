function GuideLink({ href, children, external = false }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`guide-link${external ? ' external' : ''}`}
    >
      <span>{children}</span>
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M7 13L13 7M8 7H13V12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

function Section({ eyebrow, title, description, children }) {
  return (
    <section className="surface p-6 sm:p-8">
      <div className="max-w-4xl">
        <div className="eyebrow mb-3">
          <span className="eyebrow-dot"></span>
          {eyebrow}
        </div>
        <h2 className="mb-3 text-2xl font-semibold text-[var(--text-primary)]">{title}</h2>
        {description && (
          <p className="mb-6 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export const metadata = {
  title: 'Project Guide | Arcium Blind Auction',
  description: 'Detailed implementation guide for the Arcium blind auction project.',
};

export default function GuidePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface subtle-grid p-6 sm:p-8">
        <div className="eyebrow mb-4">
          <span className="eyebrow-dot"></span>
          Project Guide
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <h1 className="section-title mb-4">Arcium Blind Auction on Solana</h1>
            <p className="max-w-3xl text-base leading-7 text-[var(--text-secondary)]">
              This project is a sealed-bid auction application built for Solana devnet with Arcium
              handling private bid encryption inputs and encrypted computation orchestration. Users
              can create an auction, submit encrypted bids from connected wallets, and finalize the
              auction to reveal a winner and payment amount.
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              The project combines on-chain auction lifecycle actions with an app-side metadata
              store so auctions, bid activity, and displayed outcomes remain visible across
              refreshes.
            </p>
          </div>

          <div className="guide-aside">
            <p className="guide-aside-label">Open in new tab</p>
            <div className="guide-link-list">
              <GuideLink href="/">Live app workspace</GuideLink>
              <GuideLink href="/api/auctions/metadata">Metadata API snapshot</GuideLink>
              <GuideLink href="/api/encryption/mxe-pubkey">MXE public key endpoint</GuideLink>
              <GuideLink href="https://docs.arcium.com" external>
                Arcium documentation
              </GuideLink>
              <GuideLink href="https://solana.com/docs" external>
                Solana documentation
              </GuideLink>
            </div>
          </div>
        </div>
      </section>

      <Section
        eyebrow="Project Purpose"
        title="What the project does"
        description="The application demonstrates how a private auction can be structured on Solana so that bids are not exposed in clear text before the auction closes."
      >
        <div className="guide-grid guide-grid-2">
          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">User-facing flow</h3>
            <ol className="guide-list guide-list-numbered">
              <li>Connect a Phantom wallet on Solana devnet.</li>
              <li>Create a new auction with item name, description, image, minimum bid, and end time.</li>
              <li>Submit a bid through the encrypted bid flow.</li>
              <li>Close and finalize the auction after the countdown completes.</li>
              <li>Inspect the recorded winner and displayed winning amount.</li>
            </ol>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Why this matters</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              Transparent auctions reveal intent early. That can distort bidding behavior, make it
              easier for participants to react to one another, and leak information before the
              close. This project explores a private-auction model where Arcium is responsible for
              the encrypted computation path rather than exposing raw bid amounts directly in the UI.
            </p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Arcium Integration"
        title="How Arcium is implemented in this project"
        description="Arcium is not just mentioned in the README. It is wired into both the app server and the Solana program flow."
      >
        <div className="guide-grid guide-grid-2">
          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">1. Encryption material is derived from Arcium state</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              The Next.js API route at <code>/api/encryption</code> uses{' '}
              <code>@arcium-hq/client</code> helpers such as <code>getMXEPublicKey</code>,{' '}
              <code>getMXEAccAddress</code>, <code>getCompDefAccAddress</code>, and{' '}
              <code>getComputationAccAddress</code> to derive the accounts and key material needed
              for encrypted workflows.
            </p>
            <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
              Relevant code:
              {' '}
              <GuideLink href="/api/encryption/mxe-pubkey">MXE key endpoint</GuideLink>
              {' '}
              and
              {' '}
              <GuideLink href="/api/encryption/arcium-accounts?computationOffset=1&circuitName=init_auction_state">
                account derivation endpoint
              </GuideLink>
              .
            </p>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">2. Bid payloads are encrypted before submission</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              The encryption route uses an ephemeral <code>x25519</code> keypair, derives a shared
              secret against the MXE public key, and encrypts bidder identity fragments plus the bid
              amount with <code>RescueCipher</code>. The frontend consumes that encrypted payload
              instead of posting a plain bid amount directly into the program instruction.
            </p>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">3. The Solana program queues Arcium computations</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              The client utility layer calls the Anchor program for three Arcium-backed phases:
              initialization, encrypted bid placement, and winner determination. In code, those
              routes are handled by <code>createAuction</code>, <code>placeBid</code>, and the
              winner-computation methods in <code>src/utils/programInstructions.js</code>.
            </p>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">4. Dedicated circuits are built and uploaded</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              The repository includes Arcium encrypted instruction definitions in{' '}
              <code>encrypted-ixs/src/lib.rs</code>. The build artifacts and comp-def scripts
              support the circuits used by the app:
            </p>
            <ul className="guide-list mt-4">
              <li><code>init_auction_state</code></li>
              <li><code>place_bid_v2</code></li>
              <li><code>determine_winner_first_price</code></li>
              <li><code>determine_winner_vickrey</code></li>
            </ul>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Privacy Model"
        title="What privacy benefits Arcium provides here"
        description="This is the core reason Arcium belongs in the architecture."
      >
        <div className="guide-grid guide-grid-3">
          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Hidden bid values during submission</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              Bids are encrypted through Arcium client primitives before the auction instruction is
              assembled, which means the application flow is centered on encrypted inputs rather than a
              clear-text bid reveal step in the public interface.
            </p>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Sealed-bid behavior</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              Other participants are not shown competitors’ bid amounts during the active auction
              window. That supports a sealed-bid user experience instead of an open outbid race.
            </p>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Computation-oriented design</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              The architecture is organized around computation definitions and encrypted state
              handling rather than a plain on-chain bid book. That is the main privacy distinction
              between this project and a transparent auction dapp.
            </p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Architecture"
        title="How the system is split between frontend, API, Solana, and Arcium"
        description="This section gives a quick code-level picture of the system."
      >
        <div className="guide-grid guide-grid-2">
          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Frontend responsibilities</h3>
            <ul className="guide-list">
              <li>Wallet connection through Solana wallet adapter.</li>
              <li>Auction creation and bid submission UI.</li>
              <li>Calling the encryption API before bid submission.</li>
              <li>Calling the Anchor program instruction helpers.</li>
              <li>Displaying auctions, counts, and final resolution information.</li>
            </ul>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">App API responsibilities</h3>
            <ul className="guide-list">
              <li>Derive Arcium account addresses used by the client.</li>
              <li>Expose the MXE public key used for encryption setup.</li>
              <li>Encrypt bid payloads through <code>@arcium-hq/client</code>.</li>
              <li>Persist auction metadata, bid records, and resolution snapshots across refreshes.</li>
            </ul>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Solana program responsibilities</h3>
            <ul className="guide-list">
              <li>Create and close auctions.</li>
              <li>Queue Arcium computations for encrypted state initialization and bid handling.</li>
              <li>Own the auction account lifecycle on devnet.</li>
            </ul>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Storage model used in the app</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              The application persists human-readable metadata and bid history through
              the local app API file store in <code>data/auction-metadata.json</code>. This keeps the
              app stable across refreshes while preserving Arcium-driven private bidding architecture.
            </p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Key Files"
        title="Where to verify the implementation"
        description="These are the most useful source entry points if someone wants to inspect the project rather than only click through the UI."
      >
        <div className="guide-grid guide-grid-2">
          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Core on-chain and circuit files</h3>
            <ul className="guide-list">
              <li><code>programs/auction/src/lib.rs</code> - Anchor program logic.</li>
              <li><code>encrypted-ixs/src/lib.rs</code> - Arcium encrypted instruction definitions.</li>
              <li><code>src/idl/auction.json</code> - client-consumed Anchor IDL.</li>
              <li><code>scripts/init-comp-defs.mjs</code> - comp-def initialization.</li>
              <li><code>scripts/finalize-comp-defs.mjs</code> - comp-def upload/finalization flow.</li>
            </ul>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Core app and integration files</h3>
            <ul className="guide-list">
              <li><code>src/app/App.jsx</code> - main operational workspace.</li>
              <li><code>src/utils/programInstructions.js</code> - Anchor program client calls.</li>
              <li><code>src/app/api/encryption/route.js</code> - Arcium account derivation and encryption API.</li>
              <li><code>src/utils/arciumEncryption.js</code> - frontend encryption client utilities.</li>
              <li><code>src/app/api/auctions/route.js</code> - metadata, bids, and resolution storage API.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="How To Explore"
        title="Suggested walkthrough"
        description="This is the shortest path to understanding the project from both a product and implementation angle."
      >
        <div className="guide-grid guide-grid-2">
          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Product walkthrough</h3>
            <ol className="guide-list guide-list-numbered">
              <li>Open the live app workspace.</li>
              <li>Connect a Phantom wallet on devnet.</li>
              <li>Create a new auction.</li>
              <li>Submit a bid through the encrypted bid form.</li>
              <li>Observe that the app keeps auction state readable after refresh.</li>
              <li>Finalize the auction after the end time and inspect the winner card.</li>
            </ol>
          </div>

          <div className="surface-subtle p-5">
            <h3 className="guide-card-title">Implementation walkthrough</h3>
            <ol className="guide-list guide-list-numbered">
              <li>Inspect <code>src/app/api/encryption/route.js</code> to see how the MXE public key and Arcium accounts are derived.</li>
              <li>Inspect <code>src/utils/programInstructions.js</code> to see how the frontend queues Arcium-backed instructions through Anchor.</li>
              <li>Inspect <code>encrypted-ixs/src/lib.rs</code> to see the encrypted instruction set used by the project.</li>
              <li>Inspect <code>programs/auction/src/lib.rs</code> to see the Solana program lifecycle.</li>
            </ol>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Current Scope"
        title="Implementation summary"
        description="This page focuses on the current behavior and architecture of the project."
      >
        <div className="surface-subtle p-5">
          <ul className="guide-list">
            <li>The project is a functional Solana application integrated with Arcium and structured around sealed-bid auction workflows.</li>
            <li>Arcium is used for encrypted bid preparation, MXE key/account derivation, and computation-definition-driven auction logic.</li>
            <li>The application keeps metadata continuity through the app API store so auctions, bid activity, and outcomes remain visible during use.</li>
            <li>The project combines privacy-oriented auction flows, Arcium integration, and a codebase that makes the encrypted workflow easy to inspect.</li>
          </ul>
        </div>
      </Section>
    </main>
  );
}
