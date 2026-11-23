
import { useMemo, useState } from "react";
const mods = import.meta.glob("../../instances/cnmid/data/published/*.json", { eager: true });
const ITEMS = Object.values(mods).map(m => m.default || m);
const CATS = ["all","community-board","open-organizer-desk","builders-corner","learning-library","opportunities","community-voices","around-the-midwest","human-side"];
const INTENTS = { all: null, discover: ["community-board","opportunities"], participate: ["open-organizer-desk","builders-corner","learning-library"], explore: ["around-the-midwest","community-voices","human-side"] };

export default function App() {
  const [intent, setIntent] = useState("all");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const list = useMemo(() => ITEMS.filter(x => {
    if (x.status !== "approved") return false;
    if (openOnly && x.participation?.mode !== "public-welcome") return false;
    if (INTENTS[intent] && !INTENTS[intent].includes(x.category)) return false;
    if (cat !== "all" && x.category !== cat) return false;
    if (q.trim() && ![x.title, x.summary, ...x.tags, x.location?.city, x.location?.venueName].join(" ").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [intent, cat, q, openOnly]);

  return (<div className="shell">
    <header className="hdr"><div><p className="eye">CNMid · Cloud Native Midwest · Open Information Hub</p><h1>The CNMid Community Corkboard</h1><p className="sub">Unified discovery across Madison & the Midwest—events, public sit-ins, open-source builds, and local hubs.</p></div><a className="btn on" href="https://github.com/devcraftsman-cloud/mosaic-community-toolkit/issues/new" target="_blank" rel="noreferrer">+ Pin to Board</a></header>
    <div className="bar">
      {Object.keys(INTENTS).map(k => <button key={k} className={"btn "+(intent===k?"on":"")} onClick={()=>{setIntent(k);setCat("all")}}>{k[0].toUpperCase()+k.slice(1)}</button>)}
      <button className={"btn "+(openOnly?"on":"")} onClick={()=>setOpenOnly(v=>!v)}>🚪 Open Doors Only</button>
      <input className="inp" placeholder="Search pins..." value={q} onChange={e=>setQ(e.target.value)} />
    </div>
    <div className="bar">{CATS.map(c => <button key={c} className={"pill "+(cat===c?"on":"")} onClick={()=>setCat(c)}>{c.replace(/-/g," ")}</button>)}</div>
    <main className="grid">{list.map(x => <article key={x.id} className="card"><div>
      <div className="top"><span className="cat">{x.category.replace(/-/g," ")}</span>{x.participation?.mode==="public-welcome"?<span className="open">Public Sit-In Welcome</span>:<span>{x.participation?.mode}</span>}</div>
      <h3>{x.title}</h3><p>{x.summary}</p>
      <div className="meta">{x.location?.venueName && <span>📍 {x.location.venueName} ({x.location.city})</span>}<span>🏷️ {x.communityIds.join(" · ")}</span></div>
      <div className="tags">{x.tags.map(t=><span key={t} className="tag">#{t}</span>)}</div>
    </div><div className="ft"><span>Via {x.attribution.publisherName}</span><a href={x.canonicalUrl} target="_blank" rel="noreferrer">Open →</a></div></article>)}</main>
  </div>);
}
