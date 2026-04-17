import { useState, useEffect } from "react";
import { Users, Mail, Loader2, Trash2, Crown, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

type Member = {
  user_id: string;
  role: string;
  joined_at: string;
  email?: string;
};

type Invite = {
  id: string;
  email: string;
  expires_at: string;
  created_at: string;
};

type Org = {
  id: string;
  name: string;
  owner_id: string;
};

const TeamSettings = ({ embedded = false }: { embedded?: boolean }) => {
  const { user } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const isOwner = org?.owner_id === user?.id;

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadTeam() {
    setLoading(true);

    const { data: memberRows } = await supabase
      .from("organization_members" as any)
      .select("org_id, user_id, role, joined_at")
      .eq("user_id", user?.id);

    if (!memberRows?.length) {
      setLoading(false);
      return;
    }

    const orgId = (memberRows[0] as any).org_id;

    const { data: orgData } = await supabase
      .from("organizations" as any)
      .select("*")
      .eq("id", orgId)
      .single();

    if (orgData) {
      setOrg(orgData as any);
      setOrgName((orgData as any).name || "");
    }

    const { data: allMembers } = await supabase
      .from("organization_members" as any)
      .select("user_id, role, joined_at")
      .eq("org_id", orgId);

    if (allMembers) {
      const memberList: Member[] = [];
      for (const m of allMembers as any[]) {
        const { data: userData } = await supabase.auth.admin?.getUser?.(m.user_id) ?? { data: null };
        const email = (userData as any)?.user?.email;
        memberList.push({ ...m, email: email || "Unknown" });
      }

      if (memberList.every((m) => !m.email || m.email === "Unknown")) {
        setMembers((allMembers as any[]).map((m: any) => ({
          ...m,
          email: m.user_id === user?.id ? user?.email || "You" : m.user_id.slice(0, 8) + "…",
        })));
      } else {
        setMembers(memberList);
      }
    }

    const { data: inviteRows } = await supabase
      .from("organization_invites" as any)
      .select("id, email, expires_at, created_at")
      .eq("org_id", orgId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    setInvites((inviteRows as any[]) || []);
    setLoading(false);
  }

  async function handleSaveName() {
    if (!org || !orgName.trim()) return;
    setIsSavingName(true);
    const { error } = await supabase
      .from("organizations" as any)
      .update({ name: orgName.trim() })
      .eq("id", org.id);

    if (error) {
      toast({ title: "Failed to update name", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Team name updated" });
      setOrg({ ...org, name: orgName.trim() });
    }
    setIsSavingName(false);
  }

  async function handleInvite() {
    if (!org || !inviteEmail.trim()) return;
    const email = inviteEmail.trim().toLowerCase();

    if (members.some((m) => m.email?.toLowerCase() === email)) {
      toast({ title: "Already a member", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-team-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email, org_id: org.id }),
        },
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to send invite");
      toast({ title: "Invite sent!", description: `${email} will receive an email.` });
      setInviteEmail("");
      loadTeam();
    } catch (e: any) {
      toast({ title: "Invite failed", description: e.message, variant: "destructive" });
    }
    setIsSending(false);
  }

  async function handleRemoveMember(userId: string) {
    if (!org) return;
    if (userId === org.owner_id) {
      toast({ title: "Can't remove the owner", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("organization_members" as any)
      .delete()
      .eq("org_id", org.id)
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Member removed" });
      setMembers(members.filter((m) => m.user_id !== userId));
    }
  }

  async function handleCancelInvite(inviteId: string) {
    const { error } = await supabase
      .from("organization_invites" as any)
      .delete()
      .eq("id", inviteId);

    if (error) {
      toast({ title: "Failed to cancel invite", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Invite cancelled" });
      setInvites(invites.filter((i) => i.id !== inviteId));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        No team found. Please contact support.
      </div>
    );
  }

  const inner = (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
      <div className="mb-8 flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Team</h1>
          <p className="mt-1 text-muted-foreground">
            Manage who has access to your Content Lab workspace
          </p>
        </div>
      </div>

      {/* Org Name */}
      {isOwner && (
        <section className="mb-8 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-lg font-bold text-foreground">Workspace Name</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            This name is visible to all team members
          </p>
          <div className="flex gap-2">
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g., Skill Studio AI"
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              onClick={handleSaveName}
              disabled={isSavingName || orgName.trim() === org.name}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:scale-105 transition-transform disabled:opacity-50"
            >
              {isSavingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
          </div>
        </section>
      )}

      {/* Members */}
      <section className="mb-8 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-bold text-foreground">
          Members ({members.length})
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          All members can view and edit articles, social posts, newsletters, and brand assets
        </p>

        <div className="divide-y divide-border rounded-lg border border-border">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {(m.email?.[0] || "?").toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {m.email}
                    {m.user_id === user?.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(m.joined_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.role === "owner" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    <Crown className="h-3 w-3" /> Owner
                  </span>
                )}
                {isOwner && m.user_id !== user?.id && (
                  <button
                    onClick={() => handleRemoveMember(m.user_id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remove member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <section className="mb-8 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold text-foreground">Pending Invites</h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleCancelInvite(inv.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invite */}
      {isOwner && (
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-lg font-bold text-foreground flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Invite a Teammate
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            They'll receive a signup link by email. Once they create an account, they'll
            automatically join your workspace and see all content.
          </p>
          <div className="flex gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              placeholder="colleague@company.com"
              type="email"
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              onClick={handleInvite}
              disabled={isSending || !inviteEmail.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:scale-105 transition-transform disabled:opacity-50"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send Invite
            </button>
          </div>
        </section>
      )}
    </motion.div>
  );

  return embedded ? inner : (
    <div className="container max-w-4xl py-8">{inner}</div>
  );
};

export default TeamSettings;
