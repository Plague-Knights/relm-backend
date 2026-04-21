export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="card">
      <h1 className="title">Relm · Wallet Link</h1>
      <p className="subtitle">
        This page exists to bind your in-game player to a Soneium wallet.
        You'll land here from the URL that <code>/wallet-link</code> prints
        in chat.
      </p>
      <ol className="step-list">
        <li>Open <code>/wallet-link</code> in Relm</li>
        <li>Click the URL it gives you (includes a one-time nonce)</li>
        <li>Connect your wallet, sign the challenge</li>
        <li>Run <code>/wallet-set &lt;address&gt; &lt;token&gt;</code> back in game</li>
      </ol>
    </div>
  );
}
