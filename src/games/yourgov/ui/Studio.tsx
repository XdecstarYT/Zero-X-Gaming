/**
 * The customisation studio: write and announce policies (then deliver or drop them), design
 * executive orders, events and crises of your own, rebrand the party, shape your leader, write
 * speeches, rename the country and its offices, and create national holidays.
 */
import { useState } from "react";
import type { EventDef } from "../data";
import type { Game, StudioPage } from "../game";
import * as C from "../campaign";
import * as P from "../politics";
import * as S from "../society";
import * as St from "../studio";
import * as G from "../sim";
import { Portrait } from "./Chamber";
import { Icon } from "./icons";
import { big, fxText, Group, money, Row, Seg, Sheet } from "./kit";
import { Field, GroupPicker, Slider, Swatches } from "./forms";

const PAGES: { id: StudioPage; label: string }[] = [
  { id: "policies", label: "Policies" },
  { id: "orders", label: "Orders" },
  { id: "events", label: "Events" },
  { id: "crises", label: "Crises" },
  { id: "party", label: "Party" },
  { id: "leader", label: "Leader" },
  { id: "speech", label: "Speeches" },
  { id: "names", label: "Names" },
  { id: "holidays", label: "Holidays" },
];

export function StudioPanel({ g }: { g: Game }) {
  const s = g.s!;
  const page = g.ui.studioPage;
  return (
    <Sheet title="Customise" eyebrow={`Make it your own · funds ${money(s, s.parties[s.party].funds)}`} onClose={() => g.setUI({ tab: null })} testId="yg-p-studio">
      <div className="yg-scrollseg">
        <Seg<StudioPage> value={page} label="Customise" onChange={(v) => g.setUI({ studioPage: v })} options={PAGES.map((p) => ({ id: p.id, label: p.label }))} testId="yg-studio-page" />
      </div>
      {page === "policies" ? (
        <Policies g={g} />
      ) : page === "orders" ? (
        <Orders g={g} />
      ) : page === "events" ? (
        <MyEvents g={g} />
      ) : page === "crises" ? (
        <MyCrises g={g} />
      ) : page === "party" ? (
        <Brand g={g} />
      ) : page === "leader" ? (
        <Leader g={g} />
      ) : page === "speech" ? (
        <SpeechPage g={g} />
      ) : page === "names" ? (
        <Names g={g} />
      ) : (
        <Holidays g={g} />
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ policies

const emptyPolicy = (): St.PolicyDraft => ({ name: "", icon: "", about: "", area: "health", cost: 6, happiness: 0.5, growth: 0, unemployment: 0, impact: 3, groups: {}, weeks: 52 });

function Policies({ g }: { g: Game }) {
  const s = g.s!;
  const [draft, setDraft] = useState<St.PolicyDraft | null>(null);
  const list = s.studio.policies;
  const waiting = list.filter((p) => p.status === "announced");
  const running = list.filter((p) => p.status === "delivered");
  const past = list.filter((p) => p.status === "scrapped" || p.status === "broken");
  if (draft) return <PolicyEditor g={g} draft={draft} setDraft={setDraft} />;
  return (
    <div data-testid="yg-policies">
      <p className="yg-lede">Announce a policy of your own: it&apos;s a promise. Deliver it in government before the deadline. Drop it and it&apos;s a U-turn; miss the deadline and it&apos;s a broken promise.</p>
      <button type="button" className="yg-cta" onClick={() => setDraft(emptyPolicy())} disabled={waiting.length >= St.POLICY_MAX} data-testid="yg-policy-new">
        <span className="yg-cta-icon">
          <Icon name="sparkle" />
        </span>
        <span>
          <b>Write a policy</b>
          <small>{waiting.length >= St.POLICY_MAX ? `${St.POLICY_MAX} waiting already` : "From a template, or from scratch"}</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      {!list.length && <p className="yg-empty">No policies yet.</p>}
      {waiting.length > 0 && (
        <Group label="Announced: waiting to be delivered">
          {waiting.map((p) => (
            <PolicyRow key={p.id} g={g} p={p} />
          ))}
        </Group>
      )}
      {running.length > 0 && (
        <Group label="Delivered: running now">
          {running.map((p) => (
            <PolicyRow key={p.id} g={g} p={p} />
          ))}
        </Group>
      )}
      {past.length > 0 && (
        <Group label="Dropped and broken">
          {past.slice(0, 8).map((p) => (
            <Row key={p.id}>
              <span className="yg-tile-ico small">{p.icon}</span>
              <span className="grow">{p.name}</span>
              <span className={`yg-tag ${p.status === "broken" ? "bad" : ""}`}>{p.status === "broken" ? "Broken" : "Dropped"}</span>
            </Row>
          ))}
        </Group>
      )}
    </div>
  );
}

function policyChips(s: G.GameState, p: Pick<St.Policy, "cost" | "happiness" | "growth" | "unemployment" | "impact" | "area" | "groups">) {
  const soc = S.areaSoc(p.area);
  const out = fxText(s, { happiness: p.happiness, growth: p.growth, unemployment: p.unemployment, budget: -p.cost })
    .split(" · ")
    .filter(Boolean);
  if (soc && p.impact) out.push(`${S.SOC.find((x) => x.id === soc)!.name} ${p.impact > 0 ? "better" : "worse"} (${p.impact > 0 ? "+" : ""}${p.impact})`);
  return (
    <span className="yg-chips">
      {out.map((t) => (
        <span key={t} className="yg-chip plain">
          {t}
        </span>
      ))}
      {Object.entries(p.groups).map(([k, v]) => (
        <span key={k} className={`yg-chip ${v > 0 ? "good" : "bad"}`}>
          {P.GROUP[k]?.icon} {v > 0 ? "+" : ""}
          {v}
        </span>
      ))}
    </span>
  );
}

function PolicyRow({ g, p }: { g: Game; p: St.Policy }) {
  const s = g.s!;
  const left = p.deadline - s.week;
  const why = p.status === "announced" ? St.deliverBlocked(s, p) : null;
  return (
    <div className="yg-policy" data-testid={`yg-policy-${p.id}`}>
      <div className="yg-policy-head">
        <span className="yg-tile-ico">{p.icon}</span>
        <div className="grow">
          <b>{p.name}</b>
          <p className="yg-muted small">{p.about || St.AREAS.find((a) => a.id === p.area)?.name}</p>
        </div>
        {p.status === "announced" ? <span className={`yg-tag ${left <= 8 ? "warn" : ""}`}>{left}w left</span> : <span className="yg-tag good">Running</span>}
      </div>
      {policyChips(s, p)}
      <div className="yg-actions">
        {p.status === "announced" && (
          <button type="button" className="yg-btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => g.run((x) => St.deliverPolicy(x, p.id), undefined, "gavel")} data-testid={`yg-policy-deliver-${p.id}`}>
            ✅ Deliver it
          </button>
        )}
        <button type="button" className="yg-btn small" onClick={() => window.confirm(p.status === "announced" ? `Drop ${p.name}? It's a U-turn: the groups it was for won't forget.` : `End ${p.name}? It saves the money, but its fans will miss it.`) && g.run((x) => St.scrapPolicy(x, p.id), undefined, "bad", -1)} data-testid={`yg-policy-drop-${p.id}`}>
          {p.status === "announced" ? "↩️ U-turn" : "End it"}
        </button>
        {why && p.status === "announced" && <span className="yg-muted small">{why}</span>}
      </div>
    </div>
  );
}

function PolicyEditor({ g, draft, setDraft }: { g: Game; draft: St.PolicyDraft; setDraft: (d: St.PolicyDraft | null) => void }) {
  const s = g.s!;
  const d = draft;
  const set = (p: Partial<St.PolicyDraft>) => setDraft({ ...d, ...p });
  const check = St.checkPolicy(d);
  const bal = St.policyBalance({ ...d, groups: d.groups });
  const L = St.POLICY_LIMITS;
  const soc = S.areaSoc(d.area);
  const fill = Math.max(0, Math.min(1, bal.allowed <= 0 ? (bal.does <= bal.allowed ? 1 : 0) : bal.does / Math.max(0.01, bal.allowed)));
  return (
    <div className="yg-editor" data-testid="yg-policy-editor">
      <Row onClick={() => setDraft(null)}>
        <Icon name="back" size={16} />
        <span className="grow">
          <b>Write a policy</b>
        </span>
      </Row>
      <p className="yg-label">Start from a template</p>
      <div className="yg-scrollchips">
        {St.TEMPLATES.map((t) => (
          <button key={t.name} type="button" className="yg-btn small" onClick={() => setDraft({ ...t, weeks: t.weeks ?? 52 })} data-testid={`yg-ptpl-${t.name.replace(/\W+/g, "-").toLowerCase()}`}>
            {t.icon} {t.name}
          </button>
        ))}
      </div>
      <div className="yg-row2">
        <Field label="Icon">
          <input className="yg-input" value={d.icon} maxLength={4} placeholder="🎯" onChange={(e) => set({ icon: e.target.value })} aria-label="Icon" />
        </Field>
        <Field label="Name">
          <input className="yg-input" value={d.name} maxLength={40} placeholder="e.g. Free dental care" onChange={(e) => set({ name: e.target.value })} data-testid="yg-policy-name" />
        </Field>
      </div>
      <Field label="In one line">
        <input className="yg-input" value={d.about} maxLength={120} placeholder="What it does" onChange={(e) => set({ about: e.target.value })} />
      </Field>
      <div className="yg-field">
        <span>Area</span>
        <div className="yg-seg wrap" role="radiogroup" aria-label="Area">
          {St.AREAS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={d.area === a.id} onClick={() => set({ area: a.id })}>
              {a.icon} {a.name}
            </button>
          ))}
        </div>
      </div>
      <div className="yg-fx">
        <Slider label="Running cost a year" value={d.cost} min={L.cost[0]} max={L.cost[1]} step={1} unit=" B" good={-1} onChange={(v) => set({ cost: v })} testId="yg-policy-cost" />
        <Slider label="Happiness" value={d.happiness} min={L.happiness[0]} max={L.happiness[1]} step={0.1} digits={1} onChange={(v) => set({ happiness: v })} />
        <Slider label="Growth" value={d.growth} min={L.growth[0]} max={L.growth[1]} step={0.01} digits={2} unit="%" onChange={(v) => set({ growth: v })} />
        <Slider label="Unemployment" value={d.unemployment} min={L.unemployment[0]} max={L.unemployment[1]} step={0.1} digits={1} unit="%" good={-1} onChange={(v) => set({ unemployment: v })} />
        {soc && <Slider label={`${S.SOC.find((x) => x.id === soc)!.name} (better or worse)`} value={d.impact} min={L.impact[0]} max={L.impact[1]} step={1} onChange={(v) => set({ impact: v })} />}
        <Slider label="Weeks to deliver it" value={d.weeks} min={L.weeks[0]} max={L.weeks[1]} step={1} good={0} onChange={(v) => set({ weeks: v })} />
      </div>
      <div className="yg-field">
        <span>Who it&apos;s for (tap: +1, +2, against)</span>
        <GroupPicker value={d.groups} onChange={(v) => set({ groups: v })} steps={[0, 1, 2, -1, -2]} testId="yg-policy-groups" />
      </div>
      <div className="yg-meter" aria-label="How much it does for what it costs">
        <span>
          Ambition <b>{bal.does.toFixed(2)}</b> of <b>{bal.allowed.toFixed(2)}</b> its cost allows
        </span>
        <i>
          <em style={{ width: `${fill * 100}%`, background: bal.does > bal.allowed + 1e-9 ? "var(--bad)" : "var(--good)" }} />
        </i>
      </div>
      <p className={typeof check === "string" ? "yg-err small" : "yg-muted small"}>{typeof check === "string" ? check : `Announcing it costs ${money(s, St.ANNOUNCE_COST)} for the launch. Once delivered it ${d.cost >= 0 ? `costs about ${big(s, St.policyCost(s, d))} a year` : `saves about ${big(s, -St.policyCost(s, d))} a year`}.`}</p>
      <button
        type="button"
        className="yg-btn primary wide big"
        disabled={typeof check === "string"}
        onClick={() => {
          if (!g.announcePolicy(d)) setDraft(null);
        }}
        data-testid="yg-policy-announce"
      >
        📣 Announce it
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ executive orders

const emptyOrder = (): Partial<St.MyOrder> => ({ name: "", icon: "", desc: "", approval: 1, happiness: 0, budget: 0, growth: 0, unemployment: 0, goodwill: {}, cooldown: 26 });

function Orders({ g }: { g: Game }) {
  const s = g.s!;
  const [edit, setEdit] = useState<{ id?: string; d: Partial<St.MyOrder> } | null>(null);
  const head = s.gov.head === s.you;
  if (edit) {
    const d = edit.d;
    const set = (p: Partial<St.MyOrder>) => setEdit({ ...edit, d: { ...d, ...p } });
    const L = St.ORDER_LIMITS;
    const risk = St.orderRisk({ approval: d.approval ?? 0, happiness: d.happiness ?? 0, budget: d.budget ?? 0, growth: d.growth ?? 0, unemployment: d.unemployment ?? 0, goodwill: d.goodwill ?? {}, cooldown: d.cooldown ?? 26 });
    return (
      <div className="yg-editor" data-testid="yg-order-editor">
        <Row onClick={() => setEdit(null)}>
          <Icon name="back" size={16} />
          <span className="grow">
            <b>{edit.id ? "Edit your order" : "Write an order"}</b>
          </span>
        </Row>
        {!edit.id && (
          <div className="yg-scrollchips">
            {St.ORDER_TEMPLATES.map((t) => (
              <button key={t.name} type="button" className="yg-btn small" onClick={() => setEdit({ d: { ...emptyOrder(), approval: 0, ...t } })}>
                {t.icon} {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="yg-row2">
          <Field label="Icon">
            <input className="yg-input" value={d.icon ?? ""} maxLength={4} placeholder="🖋️" onChange={(e) => set({ icon: e.target.value })} aria-label="Icon" />
          </Field>
          <Field label="Name">
            <input className="yg-input" value={d.name ?? ""} maxLength={36} placeholder="e.g. Free school uniforms" onChange={(e) => set({ name: e.target.value })} data-testid="yg-order-name" />
          </Field>
        </div>
        <Field label="What it does">
          <input className="yg-input" value={d.desc ?? ""} maxLength={100} onChange={(e) => set({ desc: e.target.value })} />
        </Field>
        <div className="yg-fx">
          <Slider label="Approval" value={d.approval ?? 0} min={L.approval[0]} max={L.approval[1]} step={0.5} digits={1} onChange={(v) => set({ approval: v })} />
          <Slider label="Happiness" value={d.happiness ?? 0} min={L.happiness[0]} max={L.happiness[1]} step={0.1} digits={1} onChange={(v) => set({ happiness: v })} />
          <Slider label="Budget (one-off)" value={d.budget ?? 0} min={L.budget[0]} max={L.budget[1]} step={1} unit=" B" onChange={(v) => set({ budget: v })} />
          <Slider label="Growth" value={d.growth ?? 0} min={L.growth[0]} max={L.growth[1]} step={0.01} digits={2} unit="%" onChange={(v) => set({ growth: v })} />
          <Slider label="Unemployment" value={d.unemployment ?? 0} min={L.unemployment[0]} max={L.unemployment[1]} step={0.1} digits={1} unit="%" good={-1} onChange={(v) => set({ unemployment: v })} />
          <Slider label="Weeks before you can use it again" value={d.cooldown ?? 26} min={L.cooldown[0]} max={L.cooldown[1]} step={1} good={0} onChange={(v) => set({ cooldown: v })} />
        </div>
        <div className="yg-field">
          <span>Voter groups (up to three)</span>
          <GroupPicker value={d.goodwill ?? {}} onChange={(v) => set({ goodwill: v })} steps={[0, 3, 6, -3, -6]} />
        </div>
        <p className={`small ${risk >= 0.3 ? "yg-err" : "yg-muted"}`} data-testid="yg-order-risk">
          {Math.round(risk * 100)}% chance the courts block it{G.sys(s).exec === "presidential" ? "" : " (half that in a parliamentary system)"}. Stronger orders are riskier; costly ones and long waits make them safer.
        </p>
        <button type="button" className="yg-btn primary wide big" onClick={() => !g.saveMade("order", d, edit.id) && setEdit(null)} data-testid="yg-order-save">
          <Icon name="check" size={16} /> Save the order
        </button>
      </div>
    );
  }
  return (
    <div data-testid="yg-myorders">
      <p className="yg-lede">Write executive orders of your own. As {G.titles(s).head} you can sign them from here or from the government panel.</p>
      <button type="button" className="yg-cta" onClick={() => setEdit({ d: emptyOrder() })} disabled={s.studio.orders.length >= St.MY_ORDERS_MAX} data-testid="yg-order-new">
        <span className="yg-cta-icon">🖋️</span>
        <span>
          <b>Write an order</b>
          <small>{s.studio.orders.length}/{St.MY_ORDERS_MAX} of your own</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      {s.studio.orders.map((o) => {
        const wait = Math.max(0, (s.orders[o.id] ?? 0) - s.week);
        return (
          <div key={o.id} className="yg-policy">
            <div className="yg-policy-head">
              <span className="yg-tile-ico">{o.icon}</span>
              <div className="grow">
                <b>{o.name}</b>
                <p className="yg-muted small">{o.desc}</p>
              </div>
              <span className={`yg-tag ${(o.risk ?? 0) >= 0.3 ? "bad" : ""}`}>{Math.round((o.risk ?? 0) * 100)}% risk</span>
            </div>
            <div className="yg-actions">
              <button type="button" className="yg-btn small primary" disabled={!head || wait > 0} title={!head ? `Only the ${G.titles(s).head}` : undefined} onClick={() => g.order(o.id)} data-testid={`yg-myorder-go-${o.id}`}>
                {wait > 0 ? `Ready in ${wait}w` : "Sign it"}
              </button>
              <button type="button" className="yg-btn small" onClick={() => setEdit({ id: o.id, d: { ...o } })}>
                <Icon name="edit" size={14} /> Edit
              </button>
              <button type="button" className="yg-btn small" onClick={() => g.run((x) => (St.deleteOrder(x, o.id) ? null : "Not found"), "Order deleted", "click", 0)} aria-label={`Delete ${o.name}`}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ events

const emptyEvent = (): St.EventDraft => ({ name: "", icon: "", desc: "", scope: "state", boost: 2, money: 0, members: 0, unity: 0, goodwill: 0, risk: 0 });
const toDraft = (e: EventDef): St.EventDraft => ({ name: e.name, icon: e.icon, desc: e.desc, scope: e.scope, boost: e.boost, money: e.money ?? 0, members: e.members ?? 0, unity: e.unity ?? 0, group: e.group, goodwill: e.goodwill ?? 0, risk: e.risk ?? 0 });

function MyEvents({ g }: { g: Game }) {
  const s = g.s!;
  const [edit, setEdit] = useState<{ id?: string; d: St.EventDraft } | null>(null);
  if (edit) {
    const d = edit.d;
    const set = (p: Partial<St.EventDraft>) => setEdit({ ...edit, d: { ...d, ...p } });
    const L = St.EVENT_LIMITS;
    const price = St.eventPrice({ ...d, boost: d.scope === "self" ? 0 : d.boost, goodwill: d.group ? d.goodwill : 0 });
    return (
      <div className="yg-editor" data-testid="yg-event-editor">
        <Row onClick={() => setEdit(null)}>
          <Icon name="back" size={16} />
          <span className="grow">
            <b>{edit.id ? "Edit your event" : "Design an event"}</b>
          </span>
        </Row>
        <div className="yg-row2">
          <Field label="Icon">
            <input className="yg-input" value={d.icon} maxLength={4} placeholder="✨" onChange={(e) => set({ icon: e.target.value })} aria-label="Icon" />
          </Field>
          <Field label="Name">
            <input className="yg-input" value={d.name} maxLength={32} placeholder="e.g. Pub quiz night" onChange={(e) => set({ name: e.target.value })} data-testid="yg-event-name" />
          </Field>
        </div>
        <Field label="Description">
          <input className="yg-input" value={d.desc} maxLength={100} onChange={(e) => set({ desc: e.target.value })} />
        </Field>
        <div className="yg-field">
          <span>Where</span>
          <Seg value={d.scope} label="Where" onChange={(v) => set({ scope: v, boost: Math.min(d.boost, v === "national" ? L.boostNational : L.boostState) })} options={[{ id: "state", label: "A region" }, { id: "national", label: "Nationwide" }, { id: "self", label: "The party" }]} className="yg-seg-fill" />
        </div>
        <div className="yg-fx">
          {d.scope !== "self" && <Slider label="Support" value={d.boost} min={0} max={d.scope === "national" ? L.boostNational : L.boostState} step={0.1} digits={1} onChange={(v) => set({ boost: v })} testId="yg-event-boost" />}
          <Slider label="Money raised (M)" value={d.money} min={0} max={L.money} step={0.1} digits={1} onChange={(v) => set({ money: v })} />
          <Slider label="New members" value={d.members} min={0} max={L.members} step={100} onChange={(v) => set({ members: v })} />
          <Slider label="Party unity" value={d.unity} min={L.unity[0]} max={L.unity[1]} step={1} onChange={(v) => set({ unity: v })} />
          <Slider label="Risk it goes wrong" value={Math.round(d.risk * 100)} min={0} max={L.risk * 100} step={1} unit="%" good={0} onChange={(v) => set({ risk: v / 100 })} />
        </div>
        <div className="yg-row2">
          <Field label="Voter group">
            <select className="yg-input" value={d.group ?? ""} onChange={(e) => set({ group: e.target.value || undefined })}>
              <option value="">None</option>
              {P.GROUPS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.icon} {x.name}
                </option>
              ))}
            </select>
          </Field>
          {d.group && <Slider label="Goodwill" value={d.goodwill} min={0} max={L.goodwill} step={1} onChange={(v) => set({ goodwill: v })} />}
        </div>
        <p className="yg-muted small">
          It costs <b>{money(s, price)}</b> each time{d.money ? " (taken from the takings)" : ""}. Riskier events are cheaper. It goes in the Events panel under <b>Yours</b>.
        </p>
        <button type="button" className="yg-btn primary wide big" onClick={() => !g.saveMade("event", d, edit.id) && setEdit(null)} data-testid="yg-event-save">
          <Icon name="check" size={16} /> Save the event
        </button>
      </div>
    );
  }
  return (
    <div data-testid="yg-myevents">
      <p className="yg-lede">Design events of your own. Hold them, or plan them in the diary, from the Events panel&apos;s <b>Yours</b> tab.</p>
      <button type="button" className="yg-cta" onClick={() => setEdit({ d: emptyEvent() })} disabled={s.studio.events.length >= St.MY_EVENTS_MAX} data-testid="yg-event-new">
        <span className="yg-cta-icon">✨</span>
        <span>
          <b>Design an event</b>
          <small>{s.studio.events.length}/{St.MY_EVENTS_MAX} of your own</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      <Group>
        {s.studio.events.map((e) => (
          <Row key={e.id}>
            <span className="yg-tile-ico small">{e.icon}</span>
            <span className="grow">
              {e.name}
              <span className="yg-muted small"> · {money(s, e.cost)}</span>
            </span>
            <button type="button" className="yg-btn small" onClick={() => g.setUI({ tab: "events", evKind: "mine", event: e.id, evWeek: null })}>
              Hold
            </button>
            <button type="button" className="yg-btn icon tiny" aria-label={`Edit ${e.name}`} onClick={() => setEdit({ id: e.id, d: toDraft(e) })}>
              <Icon name="edit" size={13} />
            </button>
            <button type="button" className="yg-btn icon tiny" aria-label={`Delete ${e.name}`} onClick={() => g.run((x) => (St.deleteEvent(x, e.id) ? null : "Not found"), "Event deleted", "click", 0)}>
              <Icon name="trash" size={13} />
            </button>
          </Row>
        ))}
        {!s.studio.events.length && <p className="yg-empty">None yet.</p>}
      </Group>
    </div>
  );
}

// ------------------------------------------------------------------ crises

type CrisisDraft = { title: string; icon: string; text: string; options: P.CrisisOption[] };
const emptyCrisis = (): CrisisDraft => ({ title: "", icon: "", text: "", options: [{ label: "Act now", approval: 2, budget: -6 }, { label: "Wait and see", approval: -2 }] });

function MyCrises({ g }: { g: Game }) {
  const s = g.s!;
  const [edit, setEdit] = useState<{ id?: string; d: CrisisDraft } | null>(null);
  if (edit) {
    const d = edit.d;
    const set = (p: Partial<CrisisDraft>) => setEdit({ ...edit, d: { ...d, ...p } });
    const setOpt = (i: number, p: Partial<P.CrisisOption>) => set({ options: d.options.map((o, k) => (k === i ? { ...o, ...p } : o)) });
    const L = St.CRISIS_LIMITS;
    const check = St.checkCrisis(s, d, edit.id ?? "check");
    return (
      <div className="yg-editor" data-testid="yg-crisis-editor">
        <Row onClick={() => setEdit(null)}>
          <Icon name="back" size={16} />
          <span className="grow">
            <b>{edit.id ? "Edit your crisis" : "Write a crisis"}</b>
          </span>
        </Row>
        <div className="yg-row2">
          <Field label="Icon">
            <input className="yg-input" value={d.icon} maxLength={4} placeholder="⚠️" onChange={(e) => set({ icon: e.target.value })} aria-label="Icon" />
          </Field>
          <Field label="Headline">
            <input className="yg-input" value={d.title} maxLength={60} placeholder="e.g. A giant sinkhole opens in {region}" onChange={(e) => set({ title: e.target.value })} data-testid="yg-crisis-title" />
          </Field>
        </div>
        <Field label="What's happening ({region} and {partner} are filled in)">
          <textarea className="yg-input" rows={2} value={d.text} maxLength={200} onChange={(e) => set({ text: e.target.value })} />
        </Field>
        {d.options.map((o, i) => (
          <div key={i} className="yg-policy">
            <div className="yg-rowflex">
              <Field label={`Choice ${i + 1}`}>
                <input className="yg-input" value={o.label} maxLength={48} onChange={(e) => setOpt(i, { label: e.target.value })} data-testid={`yg-crisis-opt-${i}`} />
              </Field>
              {d.options.length > 2 && (
                <button type="button" className="yg-btn icon small" aria-label="Remove this choice" onClick={() => set({ options: d.options.filter((_, k) => k !== i) })}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
            <div className="yg-fx">
              <Slider label="Approval" value={o.approval ?? 0} min={L.approval[0]} max={L.approval[1]} step={1} onChange={(v) => setOpt(i, { approval: v })} />
              <Slider label="Happiness" value={o.happiness ?? 0} min={L.happiness[0]} max={L.happiness[1]} step={0.1} digits={1} onChange={(v) => setOpt(i, { happiness: v })} />
              <Slider label="Budget (one-off)" value={o.budget ?? 0} min={L.budget[0]} max={L.budget[1]} step={1} unit=" B" onChange={(v) => setOpt(i, { budget: v })} />
              <Slider label="Growth" value={o.growth ?? 0} min={L.growth[0]} max={L.growth[1]} step={0.05} digits={2} unit="%" onChange={(v) => setOpt(i, { growth: v })} />
              <Slider label="Relations abroad" value={o.foreign ?? 0} min={L.foreign[0]} max={L.foreign[1]} step={1} onChange={(v) => setOpt(i, { foreign: v })} />
            </div>
            <GroupPicker value={o.goodwill ?? {}} onChange={(v) => setOpt(i, { goodwill: v })} steps={[0, 4, 8, -4, -8]} />
          </div>
        ))}
        {d.options.length < 3 && (
          <button type="button" className="yg-btn" onClick={() => set({ options: [...d.options, { label: "Another way", approval: 0 }] })}>
            <Icon name="plus" size={16} /> Add a choice
          </button>
        )}
        <p className={typeof check === "string" ? "yg-err small" : "yg-muted small"}>{typeof check === "string" ? check : "It joins the crises that can strike the country."}</p>
        <button type="button" className="yg-btn primary wide big" disabled={typeof check === "string"} onClick={() => !g.saveMade("crisis", d, edit.id) && setEdit(null)} data-testid="yg-crisis-save">
          <Icon name="check" size={16} /> Save the crisis
        </button>
      </div>
    );
  }
  return (
    <div data-testid="yg-mycrises">
      <p className="yg-lede">Write crises of your own: they strike at random, like the built-in ones, and whoever governs has to choose. Every choice must cost something.</p>
      <div className="yg-field">
        <span>How often yours strike</span>
        <Seg value={String(s.studio.crisisRate)} label="How often" onChange={(v) => g.run((x) => void (x.studio.crisisRate = Number(v)), "", "click")} options={St.CRISIS_RATES.map((r, i) => ({ id: String(i), label: r.name }))} className="yg-seg-fill" testId="yg-crisis-rate" />
      </div>
      <button type="button" className="yg-cta" onClick={() => setEdit({ d: emptyCrisis() })} disabled={s.studio.crises.length >= St.MY_CRISES_MAX} data-testid="yg-crisis-new">
        <span className="yg-cta-icon">⚠️</span>
        <span>
          <b>Write a crisis</b>
          <small>{s.studio.crises.length}/{St.MY_CRISES_MAX} of your own</small>
        </span>
        <Icon name="chevron" size={18} />
      </button>
      <Group>
        {s.studio.crises.map((c) => (
          <Row key={c.id}>
            <span className="yg-tile-ico small">{c.icon}</span>
            <span className="grow">{c.title}</span>
            <button type="button" className="yg-btn icon tiny" aria-label={`Edit ${c.title}`} onClick={() => setEdit({ id: c.id, d: { title: c.title, icon: c.icon, text: c.text, options: c.options.map((o) => ({ ...o })) } })}>
              <Icon name="edit" size={13} />
            </button>
            <button type="button" className="yg-btn icon tiny" aria-label={`Delete ${c.title}`} onClick={() => g.run((x) => (St.deleteCrisis(x, c.id) ? null : "It's happening now: answer it first"), "Crisis deleted", "click", 0)}>
              <Icon name="trash" size={13} />
            </button>
          </Row>
        ))}
        {!s.studio.crises.length && <p className="yg-empty">None yet.</p>}
      </Group>
    </div>
  );
}

// ------------------------------------------------------------------ the party's brand

const BRAND_COLOURS = ["#e4003b", "#0087dc", "#faa61a", "#6ab023", "#12b6cf", "#8e44ad", "#2c3e50", "#d35400", "#16a085", "#c0392b", "#f1c40f", "#7f8c8d"];

function Brand({ g }: { g: Game }) {
  const s = g.s!;
  const me = G.party(s, s.party);
  const [b, setB] = useState<St.Brand>({ name: me.name, short: me.short, color: me.color, slogan: s.studio.slogan, logo: s.studio.logo, ideology: me.ideology });
  const set = (p: Partial<St.Brand>) => setB({ ...b, ...p });
  const changed = b.name !== me.name || b.short !== me.short || b.color.toLowerCase() !== me.color.toLowerCase() || b.ideology !== me.ideology;
  return (
    <div className="yg-editor" data-testid="yg-brand">
      <div className="yg-brandcard" style={{ ["--c" as string]: b.color }}>
        <span className="yg-brandlogo">{b.logo || b.short.slice(0, 2)}</span>
        <div className="grow">
          <b>{b.name || "Your party"}</b>
          <small>{b.slogan || b.ideology}</small>
        </div>
        <span className="yg-tag">{b.short}</span>
      </div>
      <Field label="Party name">
        <input className="yg-input" value={b.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} data-testid="yg-brand-name" />
      </Field>
      <div className="yg-row2 even">
        <Field label="Short name">
          <input className="yg-input" value={b.short} maxLength={6} onChange={(e) => set({ short: e.target.value.toUpperCase() })} data-testid="yg-brand-short" />
        </Field>
        <Field label="Logo (emoji)">
          <input className="yg-input" value={b.logo} maxLength={4} placeholder="🌹" onChange={(e) => set({ logo: e.target.value })} data-testid="yg-brand-logo" />
        </Field>
      </div>
      <div className="yg-field">
        <span>Colour</span>
        <div className="yg-swatches">
          <Swatches value={b.color} options={BRAND_COLOURS} onChange={(c) => set({ color: c })} label="Party colour" />
          <input type="color" className="yg-colour" value={b.color} onChange={(e) => set({ color: e.target.value })} aria-label="Any colour" title="Any colour" />
        </div>
      </div>
      <Field label="Slogan">
        <input className="yg-input" value={b.slogan} maxLength={60} placeholder="e.g. Forward, together" onChange={(e) => set({ slogan: e.target.value })} data-testid="yg-brand-slogan" />
      </Field>
      <Field label="What you call your politics">
        <input className="yg-input" value={b.ideology} maxLength={30} onChange={(e) => set({ ideology: e.target.value })} />
      </Field>
      <p className="yg-muted small">{changed ? `A rebrand costs ${money(s, St.REBRAND_COST)}. A new name costs a little recognition at first; a new label upsets some members. The press loves a relaunch.` : "The slogan and logo are free to change."}</p>
      <button type="button" className="yg-btn primary wide big" onClick={() => g.run((x) => St.rebrand(x, b), changed ? undefined : "Saved", "cheer")} data-testid="yg-brand-save">
        🎨 {changed ? "Relaunch the party" : "Save"}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ your leader

function Leader({ g }: { g: Game }) {
  const s = g.s!;
  const me = G.pol(s, s.you)!;
  const st = s.studio;
  const [d, setD] = useState<St.LeaderDraft>({ first: me.first, last: me.last, nick: st.nick, catchphrase: st.catchphrase, background: st.background || undefined });
  const set = (p: Partial<St.LeaderDraft>) => setD({ ...d, ...p });
  return (
    <div className="yg-editor" data-testid="yg-leader">
      <div className="yg-govhead">
        <Portrait s={s} p={me} size={56} />
        <div className="grow">
          <b>
            {d.first} {d.last}
          </b>
          {d.nick && <span className="yg-muted small">“{d.nick}”</span>}
          <span className="yg-muted small">
            Charisma {me.charisma}/10{st.background ? ` · ${St.BACKGROUNDS.find((x) => x.id === st.background)?.name}` : ""}
          </span>
        </div>
        <button type="button" className="yg-btn small" onClick={() => g.run((x) => St.editLeader(x, { ...d, newLook: true }), "A new look", "click")} data-testid="yg-leader-look">
          🎲 New look
        </button>
      </div>
      <div className="yg-row2">
        <Field label="First name">
          <input className="yg-input" value={d.first} maxLength={20} onChange={(e) => set({ first: e.target.value })} data-testid="yg-leader-first" />
        </Field>
        <Field label="Last name">
          <input className="yg-input" value={d.last} maxLength={24} onChange={(e) => set({ last: e.target.value })} data-testid="yg-leader-last" />
        </Field>
      </div>
      <Field label="Nickname">
        <input className="yg-input" value={d.nick} maxLength={24} placeholder="e.g. The Iron Teacher" onChange={(e) => set({ nick: e.target.value })} />
      </Field>
      <Field label="Catchphrase (say it in a speech for a little lift)">
        <input className="yg-input" value={d.catchphrase} maxLength={60} placeholder="e.g. Forward together" onChange={(e) => set({ catchphrase: e.target.value })} data-testid="yg-leader-catchphrase" />
      </Field>
      <div className="yg-field">
        <span>Background {st.background ? "(set for good)" : "(choose once)"}</span>
        <div className="yg-bgs">
          {St.BACKGROUNDS.map((b) => (
            <button key={b.id} type="button" className="yg-bg" aria-pressed={(d.background ?? "") === b.id} disabled={!!st.background && st.background !== b.id} onClick={() => set({ background: b.id })} data-testid={`yg-bg-${b.id}`}>
              <span>{b.icon}</span>
              <b>{b.name}</b>
              <small>
                {P.GROUP[b.group]?.icon} {b.about}
              </small>
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="yg-btn primary wide big" onClick={() => g.run((x) => St.editLeader(x, d), "Your profile is saved", "paper")} data-testid="yg-leader-save">
        <Icon name="check" size={16} /> Save
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ the speech writer

export function SpeechWriter({ g, onGive, cta, testId = "yg-speech" }: { g: Game; onGive: (d: St.SpeechDraft) => void; cta: string; testId?: string }) {
  const s = g.s!;
  const [d, setD] = useState<St.SpeechDraft>(St.defaultSpeech());
  const set = (p: Partial<St.SpeechDraft>) => setD({ ...d, ...p });
  const toggle = (id: string) => set({ themes: d.themes.includes(id) ? d.themes.filter((x) => x !== id) : d.themes.length >= 3 ? d.themes : [...d.themes, id] });
  return (
    <div className="yg-editor" data-testid={testId}>
      <div className="yg-field">
        <span>Themes (up to three; one, done well, is focused)</span>
        <div className="yg-themes">
          {St.THEMES.map((t) => (
            <button key={t.id} type="button" aria-pressed={d.themes.includes(t.id)} onClick={() => toggle(t.id)} data-testid={`${testId}-theme-${t.id}`}>
              {t.icon} {t.name}
            </button>
          ))}
        </div>
      </div>
      <div className="yg-field">
        <span>Tone</span>
        <Seg value={d.tone} label="Tone" onChange={(v) => set({ tone: v })} options={St.TONES.map((t) => ({ id: t.id, label: t.name, title: t.about }))} className="yg-seg-fill" testId={`${testId}-tone`} />
        <small className="yg-muted">{St.TONES.find((t) => t.id === d.tone)?.about}</small>
      </div>
      <div className="yg-field">
        <span>Length</span>
        <Seg value={d.length} label="Length" onChange={(v) => set({ length: v })} options={[{ id: "short", label: "Short" }, { id: "medium", label: "Medium" }, { id: "long", label: "Long" }]} className="yg-seg-fill" />
        <small className="yg-muted">Long speeches land harder, unless they ramble.</small>
      </div>
      <Field label="The line you want quoted">
        <input className="yg-input" value={d.line} maxLength={90} placeholder={s.studio.catchphrase || "e.g. We will build the future together"} onChange={(e) => set({ line: e.target.value })} data-testid={`${testId}-line`} />
      </Field>
      <p className="yg-muted small">What people care about now: {Object.entries(C.issues(s)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => St.THEMES.find((t) => t.id === k)?.name ?? k).join(", ")}.</p>
      <button type="button" className="yg-btn primary wide big" disabled={!d.themes.length} onClick={() => onGive(d)} data-testid={`${testId}-give`}>
        🎤 {cta}
      </button>
    </div>
  );
}

function SpeechPage({ g }: { g: Game }) {
  const s = g.s!;
  const wait = Math.max(0, St.SPEECH_GAP - (s.week - s.studio.speechAt));
  return (
    <>
      <p className="yg-lede">{s.gov.head === s.you ? "Address the nation: a good speech lifts your approval." : "Give a major speech: a good one lifts your party in the polls."} Pick themes people care about and a tone that fits the moment.</p>
      {wait > 0 ? <p className="yg-note">Your next big speech can be in {wait} weeks.</p> : <SpeechWriter g={g} onGive={(d) => g.giveSpeech(d)} cta={s.gov.head === s.you ? "Address the nation" : "Give the speech"} />}
    </>
  );
}

// ------------------------------------------------------------------ names

function Names({ g }: { g: Game }) {
  const s = g.s!;
  const sy = G.sys(s);
  const t = G.titles(s);
  const c = G.country(s);
  const [n, setN] = useState<Partial<St.Names>>({ country: s.sc.name, head: t.head, leader: t.leader, president: t.president, lower: sy.lower.name, lowerShort: sy.lower.short, upper: sy.upper.name, upperShort: sy.upper.short, ministries: { ...s.studio.ministries }, regions: Object.fromEntries(c.states.map((x) => [x.id, s.studio.regions[x.id] ?? ""])) });
  const set = (p: Partial<St.Names>) => setN({ ...n, ...p });
  return (
    <div className="yg-editor" data-testid="yg-names">
      <p className="yg-lede">Rename the country, its offices and houses, the ministries and the regions. Leave a ministry or region blank for its usual name.</p>
      <Field label="The country">
        <input className="yg-input" value={n.country} maxLength={40} onChange={(e) => set({ country: e.target.value })} data-testid="yg-name-country" />
      </Field>
      <div className="yg-row2">
        <Field label="Head of government">
          <input className="yg-input" value={n.head} maxLength={30} onChange={(e) => set({ head: e.target.value })} data-testid="yg-name-head" />
        </Field>
        <Field label="Party leader">
          <input className="yg-input" value={n.leader} maxLength={30} onChange={(e) => set({ leader: e.target.value })} />
        </Field>
      </div>
      {sy.pres && (
        <Field label="President">
          <input className="yg-input" value={n.president} maxLength={30} onChange={(e) => set({ president: e.target.value })} />
        </Field>
      )}
      <div className="yg-row2">
        <Field label="Lower house">
          <input className="yg-input" value={n.lower} maxLength={40} onChange={(e) => set({ lower: e.target.value })} />
        </Field>
        <Field label="Short">
          <input className="yg-input" value={n.lowerShort} maxLength={14} onChange={(e) => set({ lowerShort: e.target.value })} />
        </Field>
      </div>
      {sy.upper.kind !== "none" && (
        <div className="yg-row2">
          <Field label="Upper house">
            <input className="yg-input" value={n.upper} maxLength={40} onChange={(e) => set({ upper: e.target.value })} />
          </Field>
          <Field label="Short">
            <input className="yg-input" value={n.upperShort} maxLength={14} onChange={(e) => set({ upperShort: e.target.value })} />
          </Field>
        </div>
      )}
      <Group label="Ministries">
        {P.PORTFOLIOS.map((pf) => (
          <label key={pf.id} className="yg-row">
            <span className="yg-tile-ico small">{pf.icon}</span>
            <input className="yg-input small grow" value={n.ministries?.[pf.id] ?? ""} placeholder={`${sy.exec === "presidential" ? "Secretary" : "Minister"} of ${pf.name}`} maxLength={40} onChange={(e) => set({ ministries: { ...n.ministries, [pf.id]: e.target.value } })} aria-label={pf.name} data-testid={`yg-name-min-${pf.id}`} />
          </label>
        ))}
      </Group>
      <Group label={`The ${t.regions}`}>
        <div className="yg-regionnames">
          {c.states.map((x) => (
            <input key={x.id} className="yg-input" value={n.regions?.[x.id] ?? ""} placeholder={x.name} maxLength={30} onChange={(e) => set({ regions: { ...n.regions, [x.id]: e.target.value } })} aria-label={`New name for ${x.name}`} />
          ))}
        </div>
      </Group>
      <button type="button" className="yg-btn primary wide big" onClick={() => g.run((x) => St.rename(x, n), "Names saved", "paper")} data-testid="yg-names-save">
        <Icon name="check" size={16} /> Save the names
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ national holidays

function Holidays({ g }: { g: Game }) {
  const s = g.s!;
  const [h, setH] = useState<St.Holiday>({ name: "", icon: "🎉", week: Math.min(52, G.weekOf(s.week) + 4) });
  const head = s.gov.head === s.you;
  return (
    <div className="yg-editor" data-testid="yg-holidays">
      <p className="yg-lede">Create up to {St.HOLIDAYS_MAX} national holidays. Each year the country takes the day off: people are happier, business grumbles about a lost day.</p>
      <Group>
        {s.studio.holidays.map((x, i) => (
          <Row key={i}>
            <span className="yg-tile-ico small">{x.icon}</span>
            <span className="grow">{x.name}</span>
            <span className="r muted small">week {x.week}</span>
            <button type="button" className="yg-btn icon tiny" aria-label={`Remove ${x.name}`} onClick={() => g.run((y) => (St.removeHoliday(y, i) ? null : "Not found"), "Holiday removed", "click", 0)}>
              <Icon name="close" size={12} />
            </button>
          </Row>
        ))}
        {!s.studio.holidays.length && <p className="yg-empty">No holidays of your own yet.</p>}
      </Group>
      {head ? (
        <>
          <div className="yg-row2">
            <Field label="Icon">
              <input className="yg-input" value={h.icon} maxLength={4} onChange={(e) => setH({ ...h, icon: e.target.value })} aria-label="Icon" />
            </Field>
            <Field label="Name">
              <input className="yg-input" value={h.name} maxLength={30} placeholder="e.g. Founders' Day" onChange={(e) => setH({ ...h, name: e.target.value })} data-testid="yg-holiday-name" />
            </Field>
          </div>
          <Field label="Week of the year">
            <select className="yg-input" value={h.week} onChange={(e) => setH({ ...h, week: Number(e.target.value) })}>
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="yg-btn primary wide big" disabled={s.studio.holidays.length >= St.HOLIDAYS_MAX} onClick={() => g.run((x) => St.addHoliday(x, h), undefined, "cheer")} data-testid="yg-holiday-add">
            🎉 Declare the holiday
          </button>
        </>
      ) : (
        <p className="yg-note">Only the {G.titles(s).head} can create a national holiday.</p>
      )}
    </div>
  );
}
