import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function WalletConnect() {
  const { connected, publicKey } = useWallet();

  return (
    <div className="flex items-center gap-3">
      {connected && publicKey && (
        <div className="hidden items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm sm:flex">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Connected</p>
            <p className="font-mono text-[var(--text-primary)]">
              {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
            </p>
          </div>
        </div>
      )}
      <WalletMultiButton className="wallet-connect-button" />
    </div>
  );
}
