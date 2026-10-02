import { Playground } from '../../playground/Playground';

export function PlaygroundPage() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Playground</h1>
        <p className="lede">Pick an orb and change any option. The code underneath follows along, and the address bar keeps your setup, so you can share it.</p>
      </header>
      <Playground />
    </div>
  );
}
