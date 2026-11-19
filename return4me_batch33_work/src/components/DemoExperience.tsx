import { useMemo, useState, type FormEvent } from "react";
import {
  Activity, AlertCircle, ArrowRight, BadgeCheck, Bell, Building2, CheckCircle2, type LucideIcon,
  ClipboardList, Clock3, FilePlus2, Landmark, LifeBuoy, LockKeyhole, Megaphone,
  PackageCheck, Search, ShieldAlert, ShieldCheck, Users, Wallet
} from "lucide-react";
import type { Role } from "../../shared/contracts";
import { DEMO_CASES, DEMO_NOTIFICATIONS, DEMO_ROLES, DEMO_TASKS, type DemoCase, type DemoTask } from "../demo/data";

type Props = { initialRole?: Role; onExit: () => void };

const currency = (amount: number) => `KSh ${amount.toLocaleString("en-KE")}`;

export default function DemoExperience({ initialRole = "claimant", onExit }: Props) {
  const [role, setRole] = useState<Role>(initialRole);
  const [tasksByRole, setTasksByRole] = useState<Record<Role, DemoTask[]>>(() => structuredClone(DEMO_TASKS));
  const [cases, setCases] = useState<DemoCase[]>(DEMO_CASES);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportKind, setReportKind] = useState<"lost" | "found">("lost");
  const [description, setDescription] = useState("");
  const [county, setCounty] = useState("Nairobi");
  const [category, setCategory] = useState("Personal belongings");
  const [feedback, setFeedback] = useState("");
  const [filter, setFilter] = useState("All");

  const roleInfo = DEMO_ROLES.find((x) => x.role === role)!;
  const tasks = tasksByRole[role] || [];
  const visibleTasks = useMemo(() => filter === "All" ? tasks : tasks.filter((task) => task.status === filter), [filter, tasks]);
  const isAdmin = role === "admin" || role === "owner";
  const isFinance = isAdmin;
  const isComms = isAdmin;

  function completeTask(id: string) {
    setTasksByRole((current) => ({
      ...current,
      [role]: current[role].map((task) => task.id === id ? { ...task, status: "Completed" } : task),
    }));
    setFeedback("Demonstration task updated locally. No production record was changed.");
  }

  function createDemoReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ref = `R4M-DEMO-${1100 + cases.length}`;
    setCases((existing) => [{ reference: ref, title: `${reportKind === "lost" ? "Lost" : "Found"} item · ${category}`, county, stage: "Drafted in demo", updated: "Just now" }, ...existing]);
    setDescription("");
    setShowReportForm(false);
    setFeedback(`${ref} created in this browser session only. It was not sent to Return4me.`);
  }

  return <main className="min-h-[70vh] bg-slate-50">
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm text-amber-950">
        <div className="flex items-center gap-2"><AlertCircle size={17}/><strong>DEMONSTRATION MODE</strong><span className="hidden sm:inline">— sample data and simulated actions only; no real cases, emails or payments.</span></div>
        <button className="text-sm font-semibold underline underline-offset-4" onClick={onExit}>Exit demo</button>
      </div>
    </div>

    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><span className="eyebrow">ROLE WORKSPACE PREVIEW</span><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#101c32]">{roleInfo.label} workspace</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{roleInfo.description} Use the role selector to inspect how responsibilities and permissions differ.</p></div>
        <label className="field-label min-w-64">Preview workspace<select className="field" value={role} onChange={(event) => { setRole(event.target.value as Role); setFilter("All"); setFeedback(""); }}>
          {DEMO_ROLES.map((item) => <option value={item.role} key={item.role}>{item.label}</option>)}
        </select></label>
      </div>

      {feedback && <div className="mt-5 flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900" role="status"><CheckCircle2 size={17} className="mt-0.5 shrink-0"/>{feedback}</div>}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricsFor(role).map((metric) => <MetricCard key={metric.label} {...metric}/>)}
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.85fr)]">
        <section className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div><h2 className="font-semibold text-slate-900">{queueTitle(role)}</h2><p className="mt-1 text-xs text-slate-500">Illustrative records only · no live service activity</p></div>
            <div className="flex items-center gap-2"><select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" aria-label="Filter tasks" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option>Needs attention</option><option>In progress</option><option>Waiting</option><option>Completed</option></select></div>
          </div>
          {visibleTasks.length === 0 ? <p className="p-8 text-sm text-slate-500">No tasks in this filter.</p> : <div className="divide-y divide-slate-100">
            {visibleTasks.map((task) => <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" key={task.id}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-900">{task.title}</h3><StatusPill value={task.status}/><PriorityPill value={task.priority}/></div><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{task.detail}</p></div>
              {task.status !== "Completed" && <button className="btn-secondary shrink-0" onClick={() => completeTask(task.id)}>Complete demo task <CheckCircle2 size={15}/></button>}
            </div>)}
          </div>}
        </section>

        <div className="space-y-6">
          <section className="surface p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Quick actions</h2><Activity size={18} className="text-blue-700"/></div><div className="mt-4 grid gap-2">
            <button className="quick-action" onClick={() => { setShowReportForm(true); setFeedback(""); }}><FilePlus2 size={16}/> Create sample report</button>
            <button className="quick-action" onClick={() => setFeedback("The case timeline is represented by the sample records below. Real case history is not connected in demo mode.")}><Clock3 size={16}/> View case timeline</button>
            <button className="quick-action" onClick={() => setFeedback("Privacy review reminder: public listings must never expose identity numbers, phone numbers, private evidence or exact custody addresses.")}><ShieldCheck size={16}/> Review privacy guidance</button>
          </div></section>
          <section className="surface p-5"><div className="flex items-center gap-2"><Bell size={17} className="text-blue-700"/><h2 className="font-semibold">Notifications</h2></div><div className="mt-3 divide-y divide-slate-100">{DEMO_NOTIFICATIONS.slice(0, 3).map((notice) => <div key={notice.id} className="py-3 first:pt-1"><div className="flex justify-between gap-2"><p className="text-sm font-medium">{notice.title}</p><span className="text-[11px] text-slate-400">{notice.time}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{notice.body}</p></div>)}</div></section>
        </div>
      </div>

      {showReportForm && <section className="surface mt-7 p-6"><div className="flex items-start justify-between gap-4"><div><span className="eyebrow">LOCAL SIMULATION</span><h2 className="mt-1 text-xl font-semibold">Create a sample report</h2><p className="mt-1 text-sm text-slate-500">This form stores a sample row in this page's memory only.</p></div><button className="btn-secondary" onClick={() => setShowReportForm(false)}>Close</button></div><form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={createDemoReport}><label className="field-label">Report type<select className="field" value={reportKind} onChange={(event) => setReportKind(event.target.value as "lost" | "found")}><option value="lost">I lost something</option><option value="found">I found something</option></select></label><label className="field-label">Category<select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>{["Personal belongings","Documents and identity","Electronics","Jewellery and valuables","School and work","Transport-related","Medical and assistive","Children's items","Cash and payment cards","Household","Other"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="field-label">County<select className="field" value={county} onChange={(event) => setCounty(event.target.value)}>{["Nairobi","Mombasa","Kiambu","Nakuru","Kisumu","Uasin Gishu","Machakos","Kajiado"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="field-label md:col-span-2">Short description<textarea className="field min-h-24" required minLength={10} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Use fictional sample information only."/></label><div className="md:col-span-2"><button className="btn-primary">Add sample record</button></div></form></section>}

      <section className="surface mt-7 overflow-hidden">
        <div className="border-b border-slate-100 p-5"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-blue-700"/><h2 className="font-semibold">Recent case activity</h2></div><p className="mt-1 text-xs text-slate-500">All references and descriptions below are fictional training data.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Record</th><th className="px-5 py-3">County</th><th className="px-5 py-3">Stage</th><th className="px-5 py-3">Updated</th></tr></thead><tbody className="divide-y divide-slate-100">{cases.map((item) => <tr key={item.reference}><td className="px-5 py-4 font-semibold text-blue-700">{item.reference}</td><td className="px-5 py-4">{item.title}</td><td className="px-5 py-4">{item.county}</td><td className="px-5 py-4"><StatusPill value={item.stage}/></td><td className="px-5 py-4 text-xs text-slate-500">{item.updated}</td></tr>)}</tbody></table></div>
      </section>

      {isAdmin && <OperationsPanel role={role}/>}
      {isFinance && <FinancePanel/>}
      {isAdmin && <TrustSafetyPanel/>}
      {isComms && <CommunicationsPanel role={role}/>}
      {role === "agent" && <AgentPanel/>}
      {role === "organisation" && <OrganisationPanel/>}
      {isAdmin && <SupportPanel/>}

      <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 shrink-0 text-slate-500" size={18}/><div><strong className="text-slate-800">Simulation boundary</strong><p className="mt-1 leading-6">The role selector does not grant access to real accounts. The sample data is not a live operational record. No email, SMS, Facebook, Telegram, IntaSend, M-Pesa, file storage, assignment, payout or real-world handover action is performed here.</p></div></div></div>
    </div>
  </main>;
}

function metricsFor(role: Role) {
  const common = {
    claimant: [{label:"My reports",value:"2",note:"Sample records"},{label:"Claims in review",value:"1",note:"No ownership decision"},{label:"Next step",value:"Evidence",note:"Private submission"},{label:"Payments",value:"Not enabled",note:"No charge collected"}],
    finder: [{label:"Found reports",value:"3",note:"Sample records"},{label:"Assigned agent",value:"1",note:"Illustrative only"},{label:"Reward status",value:"On hold",note:"Not payable"},{label:"Next step",value:"Drop-off",note:"Only to authorised agent"}],
    agent: [{label:"Active assignments",value:"4",note:"Sample records"},{label:"Items in custody",value:"2",note:"Illustrative only"},{label:"Collections planned",value:"1",note:"Not scheduled"},{label:"Availability",value:"Available",note:"Demo status"}],
    organisation: [{label:"Organisation cases",value:"12",note:"Sample records"},{label:"Open reports",value:"4",note:"Sample records"},{label:"Active members",value:"6",note:"Individual accounts"},{label:"Access exceptions",value:"0",note:"Demo data"}],
    admin: [{label:"Reports",value:"128",note:"Fictional dataset"},{label:"Needs review",value:"13",note:"Queue example"},{label:"Operational queues",value:"8",note:"Illustrative categories"},{label:"Open exceptions",value:"3",note:"Requires review"}],
    owner: [{label:"Reports this month",value:"128",note:"Fictional dataset"},{label:"Active agents",value:"24",note:"Not live coverage"},{label:"Service counties",value:"8",note:"Sample deployment"},{label:"Pending decisions",value:"3",note:"Owner final review"}],
  } satisfies Record<Role, {label:string;value:string;note:string}[]>;
  return common[role].map((item) => ({...item, icon: iconFor(role)}));
}

function iconFor(role: Role) {
  if (role === "organisation") return Building2;
  if (role === "agent") return PackageCheck;
  if (role === "owner") return Landmark;
  if (role === "admin") return ClipboardList;
  if (role === "finder") return Search;
  return ShieldCheck;
}

function queueTitle(role: Role) {
  return ({ claimant: "Your recovery checklist", finder: "Finder action queue", agent: "Agent work queue", organisation: "Organisation tasks", admin: "Operational review queue", owner: "Super Admin final authority and oversight" } satisfies Record<Role,string>)[role];
}

function MetricCard({label,value,note,icon:Icon}:{label:string;value:string;note:string;icon:LucideIcon}) {
  return <div className="surface p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">{label}</p><Icon size={17} className="text-blue-700"/></div><p className="mt-3 text-2xl font-semibold tracking-tight text-[#101c32]">{value}</p><p className="mt-1 text-[11px] text-slate-400">{note}</p></div>;
}
function StatusPill({value}:{value:string}) { const good = ["Completed","Approved","Published","Closed in demo"].includes(value); const warn = ["Needs attention","Under review","Waiting","On hold","Blocked"].includes(value); return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${good?"bg-teal-50 text-teal-800":warn?"bg-amber-50 text-amber-800":"bg-slate-100 text-slate-600"}`}>{value}</span>; }
function PriorityPill({value}:{value:string}) { return <span className={`text-[10px] font-semibold uppercase tracking-wide ${value === "High" ? "text-red-700" : value === "Normal" ? "text-slate-500" : "text-slate-400"}`}>{value} priority</span>; }

function OperationsPanel({role}:{role:"admin"|"owner"|Role}) {
  return <section className="mt-7 grid gap-5 md:grid-cols-2"><div className="surface p-5"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-blue-700"/><h2 className="font-semibold">Operational queues</h2></div><div className="mt-4 space-y-3">{[["Report privacy review","6"],["Claims awaiting human decision","4"],["Agent applications","5"],["Unassigned cases","3"],["Support escalations","2"]].map(([name,count])=><div className="flex justify-between border-b border-slate-100 pb-2 text-sm" key={name}><span className="text-slate-600">{name}</span><strong>{count}</strong></div>)}</div></div><div className="surface p-5"><div className="flex items-center gap-2"><BadgeCheck size={18} className="text-blue-700"/><h2 className="font-semibold">{role === "owner" ? "Governance controls" : "Admin control reminders"}</h2></div><ul className="mt-4 space-y-3 text-sm leading-5 text-slate-600"><li>• Never publish a found-item notice before authorised custody.</li><li>• A match is not proof of ownership; claims require authorised human review.</li><li>• Role grants, suspensions and sensitive decisions must be audited.</li><li>• The Super Admin (Owner) has final authority; sensitive access and consequential actions remain authenticated and audited.</li></ul></div></section>;
}
function FinancePanel() { return <section className="surface mt-7 p-5"><div className="flex items-center gap-2"><Wallet size={18} className="text-blue-700"/><h2 className="font-semibold">Illustrative financial controls</h2></div><div className="mt-4 grid gap-4 md:grid-cols-3">{[{title:"Target allocation",value:"33% Finder · 25% Agent · 42% Platform"},{title:"Settlement timing",value:"48-hour eligibility window"},{title:"Payout authority",value:"Manual Admin-authorised initiation"}].map((item)=><div className="rounded-xl bg-slate-50 p-4" key={item.title}><p className="text-xs font-medium text-slate-500">{item.title}</p><p className="mt-2 text-sm font-semibold text-slate-800">{item.value}</p></div>)}</div><p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">No provider balance is connected. These are policy examples, not balances or liabilities. Payment collection, refunds and payouts are disabled in this preview.</p></section>; }
function TrustSafetyPanel() { return <section className="surface mt-7 p-5"><div className="flex items-center gap-2"><ShieldAlert size={18} className="text-blue-700"/><h2 className="font-semibold">Sensitive case safeguards</h2></div><div className="mt-4 grid gap-4 md:grid-cols-3"><InfoCard title="Dispute" text="Pause release and affected settlement until an authorised resolution."/><InfoCard title="Legal concern" text="Preserve the record, restrict disclosure and follow documented escalation."/><InfoCard title="Risk signal" text="Use as a review prompt only; do not make automatic fraud determinations."/></div></section>; }
function CommunicationsPanel({role}:{role:Role}) { const [items,setItems] = useState(["Found-item safety notice · Draft","Service availability update · Pending approval","Scam-awareness message · Approved"]); return <section className="surface mt-7 p-5"><div className="flex items-center gap-2"><Megaphone size={18} className="text-blue-700"/><h2 className="font-semibold">Communications workflow</h2></div><div className="mt-3 space-y-2">{items.map((item)=> <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm" key={item}><span>{item}</span><span className="text-xs text-slate-500">{role === "owner" ? "Super Admin" : "Admin"}</span></div>)}</div><button className="btn-secondary mt-4" onClick={()=>setItems((existing)=>[...existing,"New demonstration content · Draft"])}>Add sample content <ArrowRight size={14}/></button><p className="mt-3 text-xs text-slate-500">No email, Facebook or Telegram post is sent from this browser preview. Admin manages drafting and review; the Owner retains final authority. External publication remains separately controlled.</p></section>; }
function AgentPanel() { return <section className="surface mt-7 p-5"><div className="flex items-center gap-2"><PackageCheck size={18} className="text-blue-700"/><h2 className="font-semibold">Custody and collection checklist</h2></div><ol className="mt-4 grid gap-3 text-sm leading-5 text-slate-600 md:grid-cols-2">{["Verify the assignment and drop-off code","Inspect the item before acceptance","Record custody with date, actor and evidence","Store only at the approved service location","Verify claimant identity or representative authority","Record both sides of the final handover"].map((item,index)=><li className="rounded-lg bg-slate-50 p-3" key={item}><strong className="mr-2 text-blue-700">0{index+1}</strong>{item}</li>)}</ol></section>; }
function OrganisationPanel() { return <section className="surface mt-7 p-5"><div className="flex items-center gap-2"><Building2 size={18} className="text-blue-700"/><h2 className="font-semibold">Organisation access model</h2></div><div className="mt-4 grid gap-3 md:grid-cols-3"><InfoCard title="Organisation admin" text="Manage approved members, invitations and organisation settings."/><InfoCard title="Case coordinator" text="Create and review only cases assigned to the organisation."/><InfoCard title="Report viewer" text="Read authorised case summaries without accessing restricted evidence."/></div><p className="mt-3 text-xs text-slate-500">No shared logins. All member actions are attributable to individual accounts.</p></section>; }
function SupportPanel() { return <section className="surface mt-7 p-5"><div className="flex items-center gap-2"><LifeBuoy size={18} className="text-blue-700"/><h2 className="font-semibold">Support and escalation</h2></div><div className="mt-4 grid gap-3 md:grid-cols-3"><InfoCard title="General question" text="Provide a plain-language update using authorised case status only."/><InfoCard title="Payment concern" text="Route to Finance; never ask the user to repay an unknown transaction."/><InfoCard title="Safety concern" text="Preserve details and escalate to Trust & Safety."/></div></section>; }
function InfoCard({title,text}:{title:string;text:string}) { return <div className="rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>; }
