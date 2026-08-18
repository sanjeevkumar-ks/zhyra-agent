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
  ShieldCheck,
  KeyRound,
  Lock,
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

export default function Settings() {
  const { adminProfile, permissions } = useAdminAuthStore();
  const isSuperAdmin = adminProfile?.role === "super_admin" || permissions.includes("*");

  const [activeTab, setActiveTab] = useState<"users" | "profile" | "roles" | "security">("users");

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

  const fetchAdminData = async () => {
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
      console.error("Failed to load admin management data:", e);
      setActionError(e.message || "Failed to load administrator accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setInviting(true);
    setActionError(null);
    try {
      await apiClient.post("/api/admin/invites", {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      });

      setShowInviteModal(false);
      setInviteEmail("");
      setInviteRole("support_admin");
      await fetchAdminData();
    } catch (e: any) {
      console.error("Failed to create admin invite:", e);
      if (e instanceof ApiError && e.status === 400) {
        setActionError(e.message || "This email is already an administrator or has an active invitation.");
      } else {
        setActionError(e.message || "Failed to send administrator invitation.");
      }
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (uid: string, newRole: "super_admin" | "support_admin" | "operations_admin") => {
    setActionError(null);
    try {
      await apiClient.put(`/api/admin/users/${uid}/role`, { role: newRole });
      await fetchAdminData();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 400 && e.message?.includes("LAST_SUPER_ADMIN_PROTECTED")) {
        setWarningModalMessage("Action Blocked: At least one active Super Admin is required to prevent lockout.");
      } else {
        setActionError(e.message || "Failed to update administrator role.");
      }
    }
  };

  const handleToggleStatus = async (userItem: AdminUserItem) => {
    setActionError(null);
    const nextStatus = userItem.status === "active" ? "inactive" : "active";
    try {
      await apiClient.put(`/api/admin/users/${userItem.uid}/status`, { status: nextStatus });
      await fetchAdminData();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 400 && e.message?.includes("LAST_SUPER_ADMIN_PROTECTED")) {
        setWarningModalMessage("Action Blocked: Cannot deactivate the last active Super Admin account.");
      } else {
        setActionError(e.message || "Failed to update administrator status.");
      }
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setActionError(null);
    try {
      await apiClient.delete(`/api/admin/invites/${inviteId}`);
      await fetchAdminData();
    } catch (e: any) {
      setActionError(e.message || "Failed to revoke administrator invitation.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Admin Console Settings</h1>
        <p className="text-[13.5px] text-slate-400">
          Manage internal Zhyra team administrators, security parameters, and role permissions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6 text-[13.5px]">
        <button
          onClick={() => setActiveTab("users")}
          className={`pb-3 font-medium transition-colors border-b-2 ${
            activeTab === "users"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Admin Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab("profile")}
          className={`pb-3 font-medium transition-colors border-b-2 ${
            activeTab === "profile"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          My Profile
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`pb-3 font-medium transition-colors border-b-2 ${
            activeTab === "roles"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Roles & Permissions
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`pb-3 font-medium transition-colors border-b-2 ${
            activeTab === "security"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Security Parameters
        </button>
      </div>

      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" /> Platform Administrators
            </h2>

            {isSuperAdmin && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all"
              >
                <UserPlus size={16} /> Invite Admin
              </button>
            )}
          </div>

          {actionError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-[13px] text-rose-400">
              {actionError}
            </div>
          )}

          {/* Active Administrators Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17] shadow-soft">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Administrator</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Active</th>
                  <th className="px-4 py-3 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Loading administrator accounts...
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{u.displayName || u.email}</p>
                        <p className="text-[11.5px] text-slate-400">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {isSuperAdmin && u.uid !== adminProfile?.uid ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleUpdateRole(u.uid, e.target.value as any)}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[12px] font-semibold text-white focus:outline-none capitalize"
                          >
                            <option value="super_admin">Super Admin</option>
                            <option value="support_admin">Support Admin</option>
                            <option value="operations_admin">Operations Admin</option>
                          </select>
                        ) : (
                          <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-400 capitalize">
                            {u.role.replace("_", " ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                            u.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[12px]">
                        {u.lastLoginAt ? new Date(u.lastLoginAt * 1000).toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isSuperAdmin && u.uid !== adminProfile?.uid && (
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                              u.status === "active"
                                ? "text-rose-400 hover:bg-rose-500/20"
                                : "text-emerald-400 hover:bg-emerald-500/20"
                            }`}
                          >
                            {u.status === "active" ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pending Invitations Table */}
          {invites.length > 0 && (
            <div className="space-y-3 pt-4">
              <h3 className="text-[14px] font-semibold text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" /> Pending Administrator Invitations
              </h3>

              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B0F17]">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11.5px] font-semibold uppercase text-slate-400">
                      <th className="px-4 py-2.5">Invited Email</th>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5">Invited By</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {invites.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-4 py-3 font-medium text-white">{inv.email}</td>
                        <td className="px-4 py-3 text-slate-300 capitalize">{inv.role.replace("_", " ")}</td>
                        <td className="px-4 py-3 text-slate-400 text-[12px]">{inv.creatorEmail || "Super Admin"}</td>
                        <td className="px-4 py-3 text-right">
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="text-rose-400 hover:underline text-[12px]"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "profile" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-4 max-w-xl">
          <h2 className="text-[16px] font-bold text-white">Administrator Profile</h2>
          <div className="space-y-3 text-[13.5px]">
            <div>
              <span className="text-slate-500">Email Address:</span>
              <p className="font-semibold text-white">{adminProfile?.email}</p>
            </div>
            <div>
              <span className="text-slate-500">Assigned Role:</span>
              <p className="font-semibold text-blue-400 capitalize">{adminProfile?.role?.replace("_", " ")}</p>
            </div>
            <div>
              <span className="text-slate-500">Firebase User ID:</span>
              <p className="font-mono text-[12px] text-slate-400">{adminProfile?.uid}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "roles" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-4">
          <h2 className="text-[16px] font-bold text-white">Zhyra Internal RBAC Matrix</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
              <h3 className="font-bold text-blue-400 text-[14px]">Super Admin</h3>
              <p className="text-[12.5px] text-slate-400">Full unrestricted platform administration and invitation authority.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
              <h3 className="font-bold text-emerald-400 text-[14px]">Support Admin</h3>
              <p className="text-[12.5px] text-slate-400">Customer support, conversation inspection, and issue troubleshooting.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
              <h3 className="font-bold text-purple-400 text-[14px]">Operations Admin</h3>
              <p className="text-[12.5px] text-slate-400">Infrastructure monitoring, integration health, and agent runtime inspection.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "security" && (
        <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-4 max-w-xl">
          <h2 className="text-[16px] font-bold text-white">Security Controls</h2>
          <p className="text-[13px] text-slate-400">
            Zhyra Admin access is restricted to verified Firebase Auth accounts registered in the `admin_users` collection.
          </p>
        </div>
      )}

      {/* Invite Admin Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0B0F17] p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-500" /> Invite Zhyra Admin
              </h3>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-400">Administrator Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="employee@zhyra.ai"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-slate-400">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-[13.5px] text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="support_admin">Support Admin</option>
                  <option value="operations_admin">Operations Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-xl border border-slate-800 px-4 py-2 text-[13px] text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {inviting ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      {warningModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#0B0F17] p-6 space-y-4 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <h3 className="text-lg font-bold text-white">Action Blocked</h3>
            <p className="text-[13.5px] text-slate-300">{warningModalMessage}</p>
            <button
              onClick={() => setWarningModalMessage(null)}
              className="w-full rounded-xl bg-slate-800 py-2.5 text-[13.5px] font-semibold text-white hover:bg-slate-700"
            >
              Understand & Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
