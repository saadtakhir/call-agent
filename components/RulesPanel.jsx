import { getRuleSections } from "@/lib/rulesCatalog";

/** Read-only reference of every text/number rule the system applies — a
 * server component (no client JS, no controls at all): the example results
 * in each table are computed from the real code on every render, see
 * lib/rulesCatalog.js. */
export default async function RulesPanel() {
  const sections = await getRuleSections();

  return (
    <div>
      <p className="muted" style={{ marginBottom: 6 }}>
        Tizim matn va raqamlar bilan ishlashda qo&apos;llaydigan barcha qoidalar. Bu bo&apos;lim <strong>faqat ko&apos;rish uchun</strong> — bu yerdan hech narsani o&apos;zgartirib bo&apos;lmaydi.
      </p>
      <p className="muted" style={{ marginBottom: 20, fontSize: "0.85rem" }}>
        &quot;Natija&quot; ustunidagi qiymatlar qo&apos;lda yozilmagan: har safar sahifa ochilganda tizimning haqiqiy kodi misolga qo&apos;llanib hisoblanadi, shuning uchun jadval doim amaldagi xatti-harakatni ko&apos;rsatadi.
      </p>

      <div className="tab-toggle" style={{ flexWrap: "wrap", marginBottom: 20, width: "fit-content", maxWidth: "100%" }}>
        {sections.map((s) => (
          <a key={s.id} href={`#rules-${s.id}`} style={{ padding: "6px 12px", fontSize: "0.85rem", textDecoration: "none", color: "inherit" }}>
            {s.title}
          </a>
        ))}
      </div>

      {sections.map((section) => (
        <div key={section.id} id={`rules-${section.id}`} className="section" style={{ marginBottom: 28, scrollMarginTop: 16 }}>
          <h3 style={{ margin: "0 0 6px" }}>{section.title}</h3>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.88rem" }}>
            {section.intro}
          </p>
          <div className="table-card">
            <div className="table-scroll">
              <table className="analog-table">
                <thead>
                  <tr>
                    {section.columns.map((c) => (
                      <th key={c} style={{ textAlign: "left" }}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, i) => (
                    <tr key={i}>
                      {row.cells.map((cell, j) => (
                        <td
                          key={j}
                          style={{
                            textAlign: "left",
                            verticalAlign: "top",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            fontFamily: row.mono?.includes(j) ? "monospace" : undefined,
                            fontSize: row.mono?.includes(j) ? "0.85rem" : undefined,
                            fontWeight: j === 0 ? 600 : undefined,
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
