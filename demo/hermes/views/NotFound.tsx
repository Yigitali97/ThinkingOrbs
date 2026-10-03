// What the canvas shows for an address with no view, or a project this user can't see: the same answer for both,
// so the canvas never confirms that a hidden project exists.

export function NotFound({ path }: { path: string }) {
  return (
    <div className="view not-found">
      <h2 className="view-title">No page at {path}</h2>
      <p className="lede">
        There’s nothing to show at <code>{path}</code>. The link may be old, or the address may have a typo. Ask Hermes for what you were
        looking for, or open a dashboard from the menu.
      </p>
    </div>
  );
}
