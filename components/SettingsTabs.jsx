"use client";

import { useState } from "react";

/** Vertical tab switcher for /ai-qongiroq-sozlamalar — one settings panel
 * shown at a time instead of all of them stacked on one long scroll.
 * `tabs` entries carry pre-rendered `icon`/`content` elements (built by the
 * server-component page) rather than component references, since a bare
 * function/component reference can't cross the server→client prop
 * boundary the way an already-rendered React element can. */
export default function SettingsTabs({ tabs }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((t) => t.id === activeId) || tabs[0];

  return (
    <div className="settings-tabs">
      <div className="settings-tabs-nav">
        {tabs.map((tab) => {
          const isActive = tab.id === active.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab${isActive ? " active" : ""}`}
              onClick={() => setActiveId(tab.id)}
            >
              <span className="settings-tab-icon">{tab.icon}</span>
              <span>
                <span className="settings-tab-title">{tab.title}</span>
                <span className="settings-tab-subtitle">{tab.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="settings-tabs-content">{active.content}</div>
    </div>
  );
}
