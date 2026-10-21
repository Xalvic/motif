export function LowerPanels() {
  return (
    <section className="lower">
      <div className="panel">
        <div className="panel-head">
          <h2>Melody starter</h2>
          <button className="btn" disabled>
            New melody
          </button>
        </div>
        <p className="sub">A rough idea to react to, drawn like FL Studio's piano roll.</p>
        <div className="empty">The piano roll shows here.</div>
      </div>

      <div className="panel">
        <span className="label">Scale for your melody</span>
        <div className="empty">The best-fit scale and raga show here.</div>
        <div className="divider" />
        <span className="label">Today's challenge</span>
        <div className="empty">A songwriting prompt shows here.</div>
        <div className="divider" />
        <span className="label">Song map idea</span>
        <div className="empty">A song structure shows here.</div>
      </div>
    </section>
  );
}
