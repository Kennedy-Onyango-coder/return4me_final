import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, RefreshCw, FileText, Activity, UserPlus, Plus, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { COUNTIES } from "../../shared/contracts";

type Organisation = { id: string; name: string; status: string; county: string; verifiedAt?: string | null };
type Membership = { organisation: Organisation; permission: "org_admin" | "case_coordinator" | "report_viewer"; joinedAt?: string | null };
type Report = { id: string; reference: string; kind: string; category: string; county: string; status: string; createdAt: string };
type Member = { id: string; userId: string; email: string; permission: "org_admin" | "case_coordinator" | "report_viewer"; acceptedAt: string | null };
type Invitation = { id: string; email: string; permission: Member["permission"]; expiresAt: string; createdAt: string; acceptedAt: string | null; revokedAt: string | null };
type ActivityItem = { id: string; action: string; resourceType: string; createdAt: string };

const permissionLabels: Record<Member["permission"], string> = {
  org_admin: "Organisation administrator",
  case_coordinator: "Case coordinator",
  report_viewer: "Report viewer",
};

export default function OrganisationWorkspace({ user, onSignIn }: { user: boolean; onSignIn: () => void }) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showReportForm, setShowReportForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<Member["permission"]>("case_coordinator");
  const [kind, setKind] = useState<"lost" | "found">("found");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [county, setCounty] = useState("Nairobi");
  const [publicConsent, setPublicConsent] = useState(false);
  const [publicDescription, setPublicDescription] = useState("");
  const [newOrganisationName, setNewOrganisationName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [newOrganisationCounty, setNewOrganisationCounty] = useState("Nairobi");

  const selected = useMemo(() => memberships.find(item => item.organisation.id === selectedId) || null, [memberships, selectedId]);
  const canCoordinate = !!selected && ["org_admin", "case_coordinator"].includes(selected.permission) && selected.organisation.status === "active";
  const canAdmin = !!selected && selected.permission === "org_admin" && selected.organisation.status === "active";

  const loadMemberships = useCallback(async () => {
    const result = await api<{ organisations: Membership[] }>("/organisations/mine");
    setMemberships(result.organisations);
    setSelectedId(current => current && result.organisations.some(item => item.organisation.id === current) ? current : result.organisations[0]?.organisation.id || "");
  }, []);

  const loadWorkspace = useCallback(async (organisationId: string) => {
    const reportsResult = await api<{ reports: Report[] }>(`/organisations/${organisationId}/reports`);
    setReports(reportsResult.reports);
    const activityResult = await api<{ activities: ActivityItem[] }>(`/organisations/${organisationId}/activity`);
    setActivity(activityResult.activities);
    const membership = memberships.find(item => item.organisation.id === organisationId);
    if (membership?.permission === "org_admin" && membership.organisation.status === "active") {
      const [membersResult, invitationsResult] = await Promise.all([
        api<{ members: Member[] }>(`/organisations/${organisationId}/members`),
        api<{ invitations: Invitation[] }>(`/organisations/${organisationId}/invitations`),
      ]);
      setMembers(membersResult.members);
      setInvitations(invitationsResult.invitations);
    } else {
      setMembers([]);
      setInvitations([]);
    }
  }, [memberships]);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      await loadMemberships();
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [loadMemberships]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selected || selected.organisation.status !== "active") {
      setReports([]); setMembers([]); setInvitations([]); setActivity([]); return;
    }
    let current = true;
    setLoading(true); setError("");
    loadWorkspace(selected.organisation.id).catch(e => { if (current) setError((e as Error).message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selected?.organisation.id, selected?.organisation.status, selected?.permission, loadWorkspace]);

  async function createOrganisation(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ organisation: { name: string; status: string } }>("/organisations", { method: "POST", body: JSON.stringify({ name: newOrganisationName, registrationNumber: registrationNumber || undefined, county: newOrganisationCounty }) });
      setMessage(`${result.organisation.name} was submitted for verification. It is not active yet.`); setNewOrganisationName(""); setRegistrationNumber(""); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ report: { reference: string } }>(`/organisations/${selected.organisation.id}/reports`, { method: "POST", body: JSON.stringify({ kind, category, itemDescription: description, county, publicListingConsent: publicConsent, ...(publicConsent ? { publicDescription } : {}) }) });
      setMessage(`Report ${result.report.reference} was submitted for review.`); setCategory(""); setDescription(""); setPublicConsent(false); setPublicDescription(""); setShowReportForm(false);
      await loadWorkspace(selected.organisation.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/organisations/${selected.organisation.id}/invitations`, { method: "POST", body: JSON.stringify({ email: inviteEmail, permission: invitePermission }) });
      setMessage(`Invitation created for ${inviteEmail}. The invited person must accept it using that verified email address.`); setInviteEmail(""); setShowInviteForm(false);
      await loadWorkspace(selected.organisation.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function changePermission(member: Member, permission: Member["permission"]) {
    if (!selected || permission === member.permission) return;
    if (!window.confirm(`Change ${member.email} to ${permissionLabels[permission]}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await api(`/organisations/${selected.organisation.id}/members/${member.id}`, { method: "PATCH", body: JSON.stringify({ permission }) }); setMessage("Member permission updated."); await loadWorkspace(selected.organisation.id); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function revokeMember(member: Member) {
    if (!selected || !window.confirm(`Remove ${member.email} from this organisation? This does not delete their Return4me account.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await api(`/organisations/${selected.organisation.id}/members/${member.id}`, { method: "DELETE" }); setMessage("Organisation access revoked."); await loadWorkspace(selected.organisation.id); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!selected || !window.confirm(`Revoke the pending invitation for ${invitation.email}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await api(`/organisations/${selected.organisation.id}/invitations/${invitation.id}`, { method: "DELETE" }); setMessage("Invitation revoked."); await loadWorkspace(selected.organisation.id); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!user) return <main className="page-shell"><span className="eyebrow">FOR ORGANISATIONS</span><h1 className="public-page-title">Coordinate lost-and-found reports across your organisation.</h1><p className="public-page-copy">For schools, businesses, transport operators, hotels, hospitals and community institutions. Every staff member uses an individual account with organisation-scoped permissions.</p><section className="surface onboarding-panel"><h2>Start organisation onboarding</h2><p>Sign in with a verified email address to register an organisation. Case functions remain locked until an administrator verifies it.</p><button className="btn-primary" type="button" onClick={onSignIn}>Sign in to continue</button></section></main>;
  if (loading && memberships.length === 0) return <main className="page-shell"><p className="loading-line" role="status">Loading your organisation workspace…</p></main>;

  return <main className="page-shell" aria-labelledby="organisation-workspace-title">
    <div className="page-heading"><div><span className="eyebrow">ORGANISATION WORKSPACE</span><h1 id="organisation-workspace-title">Your organisation</h1><p>Coordinate authorised reports, members and activity using individual accounts and organisation-scoped permissions.</p></div><button className="btn-secondary" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} aria-hidden="true"/> Refresh</button></div>
    {error && <p className="feedback feedback-error" role="alert">{error}</p>}{message && <p className="feedback feedback-success" role="status">{message}</p>}
    <section className="surface registration-panel" id="organisation-registration"><div><h2>Register another organisation</h2><p>New organisations remain pending until independently verified.</p></div><form className="registration-form" onSubmit={createOrganisation}><label className="field-label">Organisation name<input className="field" required minLength={2} maxLength={220} value={newOrganisationName} onChange={e => setNewOrganisationName(e.target.value)}/></label><label className="field-label">Registration number <span className="optional-label">Optional</span><input className="field" maxLength={120} value={registrationNumber} onChange={e => setRegistrationNumber(e.target.value)}/></label><label className="field-label">County<select className="field" value={newOrganisationCounty} onChange={e => setNewOrganisationCounty(e.target.value)}>{COUNTIES.map(value => <option key={value}>{value}</option>)}</select></label><button className="btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit for verification"}</button></form></section>
    {memberships.length === 0 ? <section className="surface empty-panel"><Building2 size={28} aria-hidden="true"/><h2>No organisation membership yet</h2><p>Register an organisation above or accept an invitation sent to your verified email address.</p></section> : <>
      <section className="surface org-switcher" aria-label="Select organisation"><label htmlFor="organisation-select">Organisation</label><select id="organisation-select" className="field" value={selectedId} onChange={event => setSelectedId(event.target.value)}>{memberships.map(item => <option key={item.organisation.id} value={item.organisation.id}>{item.organisation.name} · {item.organisation.status.replaceAll("_", " ")}</option>)}</select>{selected && <div className="org-meta"><span>{selected.organisation.county} County</span><span>{permissionLabels[selected.permission]}</span><span className={`status-pill ${selected.organisation.status === "active" ? "status-positive" : "status-warning"}`}>{selected.organisation.status.replaceAll("_", " ")}</span></div>}</section>
      {selected?.organisation.status !== "active" ? <section className="notice-panel" role="status"><ShieldCheck size={20} aria-hidden="true"/><div><h2>Verification is pending</h2><p>Case creation, member invitations and operational reports remain unavailable until an administrator verifies this organisation. You can refresh this page for status updates.</p></div></section> : <>
        <section className="metric-grid" aria-label="Organisation overview"><article className="surface metric-tile"><span>Reports</span><strong>{reports.length}</strong><small>Organisation-linked reports</small></article><article className="surface metric-tile"><span>Active members</span><strong>{canAdmin ? members.length : "—"}</strong><small>{canAdmin ? "Current accepted members" : "Visible to organisation administrators"}</small></article><article className="surface metric-tile"><span>Pending invitations</span><strong>{canAdmin ? invitations.filter(item => !item.acceptedAt && !item.revokedAt && new Date(item.expiresAt) > new Date()).length : "—"}</strong><small>{canAdmin ? "Not yet accepted" : "Visible to organisation administrators"}</small></article></section>
        <div className="workspace-grid">
          <section className="surface panel-card" aria-labelledby="org-reports-heading"><div className="panel-heading"><div><h2 id="org-reports-heading">Reports and cases</h2><p>Only organisation-linked report metadata is displayed here.</p></div>{canCoordinate && <button className="btn-primary" type="button" onClick={() => setShowReportForm(value => !value)}><Plus size={16} aria-hidden="true"/> New report</button>}</div>
            {showReportForm && <form className="inline-form" onSubmit={submitReport}><h3>Create an organisation report</h3><div className="form-grid"><label className="field-label">Report type<select className="field" value={kind} onChange={e => setKind(e.target.value as "lost" | "found")}><option value="found">Found item</option><option value="lost">Lost item</option></select></label><label className="field-label">Category<input className="field" required minLength={2} maxLength={100} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Bag, phone, document"/></label><label className="field-label">County<select className="field" value={county} onChange={e => setCounty(e.target.value)}>{COUNTIES.map(value => <option key={value}>{value}</option>)}</select></label></div><label className="field-label">Private item description<textarea className="field" required minLength={15} maxLength={4000} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe identifying details. Do not include passwords or one-time codes."/></label><label className="check-row"><input type="checkbox" checked={publicConsent} onChange={e => setPublicConsent(e.target.checked)}/> I separately consent to a public-safe listing</label>{publicConsent && <label className="field-label">Public-safe description<textarea className="field" required maxLength={600} rows={3} value={publicDescription} onChange={e => setPublicDescription(e.target.value)} placeholder="Do not include contact details, identity numbers, serials or exact addresses."/></label>}<div className="form-actions"><button className="btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit report"}</button><button className="btn-secondary" type="button" onClick={() => setShowReportForm(false)}>Cancel</button></div></form>}
            {reports.length === 0 ? <div className="empty-inline"><FileText size={22} aria-hidden="true"/><p>No organisation reports yet.</p>{canCoordinate && <span>Create a report when your organisation is ready.</span>}</div> : <div className="responsive-table-wrap"><table className="data-table"><caption className="sr-only">Organisation reports</caption><thead><tr><th scope="col">Reference</th><th scope="col">Type</th><th scope="col">Category</th><th scope="col">County</th><th scope="col">Submitted</th><th scope="col">Status</th></tr></thead><tbody>{reports.map(report => <tr key={report.id}><th scope="row">{report.reference}</th><td>{report.kind === "lost" ? "Lost" : "Found"}</td><td>{report.category}</td><td>{report.county}</td><td>{new Date(report.createdAt).toLocaleDateString("en-KE")}</td><td><span className="status-pill">{report.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div>}
          </section>
          <section className="surface panel-card" aria-labelledby="org-activity-heading"><div className="panel-heading"><div><h2 id="org-activity-heading">Recent activity</h2><p>Organisation-level activity metadata; private case content is excluded.</p></div><Activity size={18} aria-hidden="true"/></div>{activity.length === 0 ? <p className="muted-copy">No recent organisation activity.</p> : <ol className="activity-list">{activity.map(item => <li key={item.id}><span className="activity-dot" aria-hidden="true"/><div><strong>{item.action.replaceAll(".", " ").replaceAll("_", " ")}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-KE")}</time></div></li>)}</ol>}</section>
        </div>
        {canAdmin && <section className="surface panel-card mt-6" aria-labelledby="org-members-heading"><div className="panel-heading"><div><h2 id="org-members-heading">Members and access</h2><p>Manage organisation membership, not individual Return4me accounts.</p></div><button className="btn-primary" type="button" onClick={() => setShowInviteForm(value => !value)}><UserPlus size={16} aria-hidden="true"/> Invite member</button></div>
          {showInviteForm && <form className="inline-form" onSubmit={inviteMember}><h3>Invite a verified email address</h3><div className="form-grid"><label className="field-label">Email address<input className="field" type="email" required maxLength={320} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="person@example.com"/></label><label className="field-label">Organisation permission<select className="field" value={invitePermission} onChange={e => setInvitePermission(e.target.value as Member["permission"])}><option value="case_coordinator">Case coordinator</option><option value="report_viewer">Report viewer</option><option value="org_admin">Organisation administrator</option></select></label></div><p className="helper-copy">The invitation expires automatically. The recipient must sign in with the same verified email address to accept it.</p><div className="form-actions"><button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button><button className="btn-secondary" type="button" onClick={() => setShowInviteForm(false)}>Cancel</button></div></form>}
          {members.length === 0 ? <p className="muted-copy">No active members were returned.</p> : <div className="responsive-table-wrap"><table className="data-table"><caption className="sr-only">Active organisation members</caption><thead><tr><th scope="col">Email</th><th scope="col">Permission</th><th scope="col">Joined</th><th scope="col">Actions</th></tr></thead><tbody>{members.map(member => <tr key={member.id}><th scope="row">{member.email}</th><td><label className="sr-only" htmlFor={`permission-${member.id}`}>Permission for {member.email}</label><select id={`permission-${member.id}`} className="field compact-field" value={member.permission} disabled={busy} onChange={e => void changePermission(member, e.target.value as Member["permission"])}><option value="org_admin">Organisation administrator</option><option value="case_coordinator">Case coordinator</option><option value="report_viewer">Report viewer</option></select></td><td>{member.acceptedAt ? new Date(member.acceptedAt).toLocaleDateString("en-KE") : "—"}</td><td><button className="text-action danger-action" type="button" disabled={busy} onClick={() => void revokeMember(member)}>Remove access</button></td></tr>)}</tbody></table></div>}
          <h3 className="subsection-title">Invitations</h3>{invitations.length === 0 ? <p className="muted-copy">No invitations have been created.</p> : <div className="invitation-list">{invitations.map(invitation => <article key={invitation.id}><div><strong>{invitation.email}</strong><span>{permissionLabels[invitation.permission]} · Expires {new Date(invitation.expiresAt).toLocaleDateString("en-KE")}</span></div><span className="status-pill">{invitation.acceptedAt ? "accepted" : invitation.revokedAt ? "revoked" : new Date(invitation.expiresAt) <= new Date() ? "expired" : "pending"}</span>{!invitation.acceptedAt && !invitation.revokedAt && new Date(invitation.expiresAt) > new Date() && <button className="text-action danger-action" type="button" disabled={busy} onClick={() => void revokeInvitation(invitation)}>Revoke</button>}</article>)}</div>}
        </section>}
      </>}
    </>}
  </main>;
}
