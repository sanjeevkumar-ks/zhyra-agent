import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { UserPlus, Clock, Trash2, X, Check } from "lucide-react";
import { AskZhyraChip, Avatar, Badge, Button, PageHeader, Panel } from "../components/ui";

export default function Team() {
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [invitedMember, setInvitedMember] = useState<any | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Support Associate");
  const [invitePermission, setInvitePermission] = useState("Member");

  const handleCloseInvite = () => {
    setShowInvite(false);
    setInvitedMember(null);
  };

  // Query team list
  const { data: team = [], isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: () => apiClient.get<any[]>("/api/team"),
  });

  // Mutation to invite teammate
  const inviteMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post<any>("/api/team/invite", payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setInviteName("");
      setInviteEmail("");
      setInvitedMember(data);
    },
  });

  // Mutation to remove teammate
  const removeMutation = useMutation({
    mutationFn: (memberId: string) => apiClient.delete(`/api/team/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    inviteMutation.mutate({
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      role: inviteRole,
      permission: invitePermission,
    });
  };

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="People behind the AI"
        title="Team"
        description="Manage who can build, train, and oversee your AI workforce."
        actions={
          <div className="flex items-center gap-2">
            <AskZhyraChip label="Suggest permission cleanup" />
            <Button icon={<UserPlus size={15} />} onClick={() => setShowInvite(true)}>
              Invite member
            </Button>
          </div>
        }
      />

      {/* Invite Member Side Drawer Overlay */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-xs" onClick={handleCloseInvite}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-canvas border-l border-line p-6 shadow-soft-lg flex flex-col gap-6 overflow-y-auto animate-slide-in h-full text-left"
          >
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h3 className="text-[16px] font-semibold text-ink">
                {invitedMember ? "Teammate Invited" : "Invite Workspace Colleague"}
              </h3>
              <button type="button" onClick={handleCloseInvite} className="p-1.5 hover:bg-canvas-alt rounded-lg text-ink-soft hover:text-ink">
                <X size={16} />
              </button>
            </div>

            {invitedMember ? (
              <div className="flex flex-col items-center justify-center gap-6 py-10 text-center flex-1">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-soft text-emerald">
                  <Check size={28} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-ink">Invitation Sent</h3>
                  <p className="text-sm leading-relaxed text-ink-soft">
                    An invite email has been sent to <span className="font-semibold">{invitedMember.email}</span>. You can also share the direct workspace invitation link below.
                  </p>
                </div>

                <div className="w-full space-y-1.5 text-left mt-4">
                  <label className="text-[12px] text-ink-faint">Workspace Invite Link</label>
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas-alt/30 p-2.5">
                    <input
                      readOnly
                      value={`${window.location.origin}/auth?invite=${invitedMember.id}`}
                      className="flex-1 bg-transparent text-[13px] text-ink-soft select-all focus:outline-none"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/auth?invite=${invitedMember.id}`);
                        alert("Invite link copied to clipboard!");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <Button className="w-full justify-center mt-6" onClick={handleCloseInvite}>
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">Full Name</label>
                    <input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="e.g. Marcus Webb"
                      className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="marcus@company.com"
                      className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">Role Title</label>
                    <input
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      placeholder="e.g. Sales Associate"
                      className="w-full rounded-xl border border-line bg-canvas-alt/30 px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] text-ink-faint">Permission Level</label>
                    <select
                      value={invitePermission}
                      onChange={(e) => setInvitePermission(e.target.value)}
                      className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[13.5px] text-ink focus:outline-none"
                    >
                      <option value="Admin">Admin (Create & configure agents)</option>
                      <option value="Member">Member (Read & train agents)</option>
                      <option value="Billing">Billing Admin (Manage workspace plans)</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-4 border-t border-line mt-auto">
                  <Button variant="outline" type="button" onClick={handleCloseInvite} className="flex-1 justify-center">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteMutation.isPending} className="flex-1 justify-center">
                    {inviteMutation.isPending ? "Sending..." : "Send invite"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-36 rounded-2xl border border-line bg-surface p-5 bg-canvas-alt/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {team.map((m) => (
            <Panel key={m.id} className="flex flex-col gap-4 group">
              <div className="flex items-start justify-between">
                <Avatar initials={m.initials || "T"} gradient={m.gradient || "from-[#2F6BFF] to-[#8B7CF6]"} size={44} />
                <button
                  onClick={() => {
                    if (confirm(`Are you sure you want to remove teammate ${m.name}?`)) {
                      removeMutation.mutate(m.id);
                    }
                  }}
                  className="text-ink-faint hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove teammate"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-ink">{m.name}</p>
                <p className="text-[12.5px] text-ink-soft">{m.role}</p>
                <p className="text-[11px] text-ink-faint">{m.email}</p>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3 mt-auto">
                <Badge tone={m.permission === "Owner" ? "accent" : "neutral"}>{m.permission}</Badge>
                <span className="flex items-center gap-1 text-[11.5px] text-ink-faint">
                  <Clock size={11} /> {m.lastActive || "Never"}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      )}

    </div>
  );
}
