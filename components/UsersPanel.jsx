"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, KeyRound, Plus } from "lucide-react";
import { useConfirm } from "./useConfirm";
import { ALL_PERMISSIONS, PERMISSION_LABELS } from "@/lib/permissions";

/** Admin panel for creating additional logins and choosing which sections
 * of the app each one can reach (see lib/auth.js's PERMISSIONS) — the
 * env-var admin account itself never shows up here since it isn't a User
 * row at all (see ENV_ADMIN_USERNAME), so there's nothing here that could
 * accidentally lock that fallback account out. */
export default function UsersPanel() {
  const { confirm, dialog } = useConfirm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPermissions, setNewPermissions] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleNewPermission(perm) {
    setNewPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  }

  async function createUser() {
    if (!newUsername.trim() || !newPassword) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, permissions: newPermissions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setUsers((prev) => [...prev, data.user]);
      setNewUsername("");
      setNewPassword("");
      setNewPermissions([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function togglePermission(user, perm) {
    const permissions = user.permissions.includes(perm)
      ? user.permissions.filter((p) => p !== perm)
      : [...user.permissions, perm];
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, permissions } : u)));
    setError("");
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
    } catch (err) {
      setError(err.message);
      load(); // roll back the optimistic toggle above
    }
  }

  async function resetPassword(user) {
    const password = window.prompt(`"${user.username}" uchun yangi parol (kamida 6 belgi):`);
    if (!password) return;
    setError("");
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeUser(user) {
    if (!(await confirm(`"${user.username}" foydalanuvchisini o'chirishni tasdiqlaysizmi?`))) return;
    setError("");
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik");
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Ruxsatni o&apos;zgartirish shu foydalanuvchining keyingi kirishidan boshlab qo&apos;llaniladi.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="section card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Yangi foydalanuvchi qo&apos;shish</div>
        <div className="add-channel-row">
          <input
            className="manage-input"
            style={{ maxWidth: 180 }}
            placeholder="login"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            autoComplete="off"
          />
          <input
            className="manage-input"
            style={{ maxWidth: 180 }}
            type="password"
            placeholder="parol (kamida 6 belgi)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          {ALL_PERMISSIONS.map((perm) => (
            <label key={perm} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
              <input type="checkbox" checked={newPermissions.includes(perm)} onChange={() => toggleNewPermission(perm)} />
              {PERMISSION_LABELS[perm]}
            </label>
          ))}
          <button className="btn" onClick={createUser} disabled={creating || !newUsername.trim() || !newPassword}>
            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            Qo&apos;shish
          </button>
        </div>
      </div>

      <div className="section">
        {loading ? (
          <p className="muted">Yuklanmoqda...</p>
        ) : users.length === 0 ? (
          <p className="muted">Hozircha qo&apos;shimcha foydalanuvchi yo&apos;q.</p>
        ) : (
          <div className="table-card">
          <div className="table-scroll">
            <table className="analog-table manage-table">
              <thead>
                <tr>
                  <th>Login</th>
                  {ALL_PERMISSIONS.map((perm) => (
                    <th key={perm}>{PERMISSION_LABELS[perm]}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 600 }}>{user.username}</td>
                    {ALL_PERMISSIONS.map((perm) => (
                      <td key={perm}>
                        <input
                          type="checkbox"
                          checked={user.permissions.includes(perm)}
                          onChange={() => togglePermission(user, perm)}
                        />
                      </td>
                    ))}
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button className="btn btn-outline btn-icon" onClick={() => resetPassword(user)} title="Parolni tiklash">
                          <KeyRound size={14} />
                        </button>
                        <button className="btn btn-danger btn-icon" onClick={() => removeUser(user)} title="O'chirish">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </div>
      {dialog}
    </div>
  );
}
