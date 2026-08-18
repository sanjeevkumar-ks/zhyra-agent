import React, { useState, useEffect } from "react";
import { useAdminAuthStore } from "../../store/useAdminAuthStore";
import { apiClient, ApiError } from "../../lib/apiClient";
import {
  Shield,
  UserPlus,
  Mail,
  Clock,
  Ban,
  AlertTriangle,
  X,
} from "lucide-react";

interface AdminUserItem {
  uid: string;
  email: string;
  displayName: string;
  role: "super_admin" | "support_admin" | "operations_admin";
  status: "active" | "inactive";
  createdAt?: number;
  lastLoginAt?: number;
}

interface AdminInviteItem {
  id: string;
  email: string;
  role: "super_admin" | "support_admin" | "operations_admin";
  status: "pending" | "accepted" | "revoked";
  creatorEmail?: string;
  createdAt?: number;
  expiresAt?: number;
}

export default function AdminUsersSettings() {
  const { adminProfile, permissions } = useAdminAuthStore();
  const isSuperAdmin = adminProfile?.role === "super_admin" || permissions.includes("*");

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [invites, setInvites] = useState<AdminInviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"support_admin" | "operations_admin" | "super_admin">("support_admin");
  const [inviting, setInviting] = useState(false);

  // Last Super Admin Warning Modal State
  const [warningModalMessage, setWarningModalMessage] = useState<string | null>(null);

  const fetchData = async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setActionError(null);
    try {
      const [uRes, iRes] = await Promise.all([
        apiClient.get<{ users: AdminUserItem[] }>("/api/admin/users"),
        apiClient.get<{ invites: AdminInviteItem[] }>("/api/admin/invites"),
      ]);
      setUsers(uRes.users || []);
      setInvites(iRes.invites || []);
    } catch (e: any) {
      console.error("Failed to load admin management data", e);
      setActionError(e.message || "Failed to load administrator accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isSuperAdmin]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setActionError(null);
    try {
      await apiClient.post("/api/admin/invites", {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteRole("support_admin");
      await fetchData();
    } catch (e: any) {
      console.error("Failed to invite admin", e);
      setActionError(e.message || "Failed to send administrator invitation.");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (targetUid: string, newRole: string) => {
    setActionError(null);
    try {
      await apiClient.put(`/api/admin/users/${targetUid}/role`, { role: newRole });
      await fetchData();
    } catch (e: any) {
      if (e instanceof ApiError && e.message.includes("last active Super Admin")) {
        setWarningModalMessage("You cannot demote the last active Super Admin.");
      } else {
        setActionError(e.message || "Failed to change role.");
      }
    }
  };

  const handleStatusToggle = async (targetUid: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "inactive" : "active";
    setActionError(null);
    try {
      await apiClient.put(`/api/admin/users/${targetUid}/status`, { status: nextStatus });
      await fetchData();
    } catch (e: any) {
      if (e instanceof ApiError && e.message.includes("last active Super Admin")) {
        setWarningModalMessage("You cannot deactivate the last active Super Admin.");
      } else {
        setActionError(e.message || "Failed to update administrator status.");
      }
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setActionError(null);
    try {
      await apiClient.delete(`/api/admin/invites/${inviteId}`);
      await fetchData();
    } catch (e: any) {
      setActionError(e.message || "Failed to revoke invitation.");
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="rounded-2xl border border-line bg-canvas-alt/40 p-6 text-ink-soft">
        <p className="text-[13.5px]">
          Only Super Administrators can invite, modify, or deactivate platform administrator accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-bold text-ink">Platform Administrator Accounts</h2>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            Manage admin users, role assignments, and pending system invitations.
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-medium text-white shadow-md transition-all hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" />
          Invite Admin
        </button>
      </div>

      {actionError && (
        <div className="flex items-center gap-3 rounded-xl border border-rose/30 bg-rose/10 p-4 text-[13px] text-rose">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{actionError}</p>
        </div>
      )}

      {/* Admin Users Table */}
      <div className="space-y-3">
        <h3 className="text-[14px] font-bold text-ink flex items-center gap-2">
          <Shield className="h-4 w-4 text-accent" /> Active Administrators ({users.length})
        </h3>
        <div className="overflow-hidden rounded-2xl border border-line bg-canvas-alt/30">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas-alt/80 text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Administrator</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined / Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-faint">
                    Loading admin users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-faint">
                    No administrator accounts found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.uid} className="hover:bg-canvas-alt/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-ink">{u.displayName || u.email}</div>
                      <div className="text-[12px] text-ink-faint">{u.email}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.uid, e.target.value)}
                        className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[12.5px] font-medium text-ink focus:outline-none"
                      >
                        <option value="super_admin">Super Admin</option>
                        <option value="support_admin">Support Admin</option>
                        <option value="operations_admin">Operations Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                          u.status === "active"
                            ? "bg-emerald/10 text-emerald"
                            : "bg-ink-faint/10 text-ink-faint"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            u.status === "active" ? "bg-emerald" : "bg-ink-faint"
                          }`}
                        />
                        {u.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-ink-soft text-[12px]">
                      {u.createdAt ? new Date(u.createdAt * 1000).toLocaleDateString() : "System Initial"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleStatusToggle(u.uid, u.status)}
                        className={`rounded-lg border px-3 py-1 text-[12px] font-medium transition-all ${
                          u.status === "active"
                            ? "border-rose/30 text-rose hover:bg-rose/10"
                            : "border-emerald/30 text-emerald hover:bg-emerald/10"
                        }`}
                      >
                        {u.status === "active" ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invitations Table */}
      <div className="space-y-3 pt-4">
        <h3 className="text-[14px] font-bold text-ink flex items-center gap-2">
          <Mail className="h-4 w-4 text-amber" /> Pending Invitations ({invites.filter(i => i.status === "pending").length})
        </h3>
        <div className="overflow-hidden rounded-2xl border border-line bg-canvas-alt/30">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas-alt/80 text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3">Invited Email</th>
                <th className="px-4 py-3">Assigned Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expires At</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {invites.filter((i) => i.status === "pending").length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink-faint">
                    No pending admin invitations.
                  </td>
                </tr>
              ) : (
                invites
                  .filter((i) => i.status === "pending")
                  .map((inv) => (
                    <tr key={inv.id} className="hover:bg-canvas-alt/50 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-ink">{inv.email}</td>
                      <td className="px-4 py-3.5 text-ink-soft capitalize">
                        {inv.role.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber/10 px-2.5 py-0.5 text-[11.5px] font-medium text-amber">
                          <Clock className="h-3 w-3" /> Pending
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-ink-faint text-[12px]">
                        {inv.expiresAt ? new Date(inv.expiresAt * 1000).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="text-[12px] font-medium text-rose hover:underline"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-[440px] rounded-2xl border border-line bg-canvas p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h3 className="text-[16px] font-bold text-ink flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-accent" /> Invite Administrator
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-ink-faint hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
                  User Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="w-full rounded-xl border border-line bg-canvas-alt/40 px-3.5 py-2.5 text-[13.5px] text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
                  Administrator Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e: any) => setInviteRole(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas-alt/40 px-3.5 py-2.5 text-[13.5px] text-ink focus:border-accent focus:outline-none"
                >
                  <option value="support_admin">Support Admin (Read user data & issue updates)</option>
                  <option value="operations_admin">Operations Admin (Agents, Health & Integrations)</option>
                  <option value="super_admin">Super Admin (Full Platform Control)</option>
                </select>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-xl border border-line px-4 py-2 text-[13px] font-medium text-ink-soft hover:bg-canvas-alt"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="rounded-xl bg-accent px-5 py-2 text-[13px] font-medium text-white shadow-md transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {inviting ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Warning Modal (Last Super Admin Protection) */}
      {warningModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-[400px] rounded-2xl border border-rose/30 bg-canvas p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose/10 text-rose">
              <Ban className="h-6 w-6" />
            </div>
            <h4 className="text-[16px] font-bold text-ink">Action Restricted</h4>
            <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">
              {warningModalMessage}
            </p>
            <button
              onClick={() => setWarningModalMessage(null)}
              className="mt-6 w-full rounded-xl bg-accent py-2.5 text-[13.5px] font-medium text-white shadow-md"
            >
              Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
