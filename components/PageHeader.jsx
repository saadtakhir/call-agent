/** One consistent header per page — icon badge, title, description — used
 * instead of each panel rendering its own ad hoc `.toolbar`+`<h2>` (which
 * left duplicate headers wherever a page combines more than one panel, and
 * gave every page a slightly different treatment). Pure/server-renderable,
 * so it costs nothing to put at the top of every page.jsx. */
export default function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-header-icon">
        <Icon size={20} />
      </div>
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
