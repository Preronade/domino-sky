import { useMemo, useState } from 'react';
import { Activity, ArrowDownUp, ArrowRight, Plane, RotateCcw, ShieldAlert, Sparkles, Timer, Users, Wind } from 'lucide-react';
import rawNetwork from './data/flight_network.json';
import { simulate, recoveryOptions, type SimulationOverrides } from './engine/simulate';
import { displayMinutes, fromMinutes, toMinutes } from './engine/time';
import type { FlightNetwork, FlightResult, RecoveryCandidate, SimulationResult } from './types';

const network = rawNetwork as FlightNetwork;
const empty = !network.airports?.length || !network.flights?.length;
const fmt = (n:number) => n.toLocaleString('en-US');

export default function App() {
  const airports = network.airports ?? [];
  const [airportId,setAirportId] = useState(airports[0]?.id ?? '');
  const [start,setStart] = useState('09:00');
  const [duration,setDuration] = useState(120);
  const [result,setResult] = useState<SimulationResult|null>(null);
  const [selected,setSelected] = useState<string|null>(null);
  const [filter,setFilter] = useState<'all'|'delayed'>('all');
  const [sort,setSort] = useState<'time'|'delay'|'flight'>('time');
  const [recoveries,setRecoveries] = useState<RecoveryCandidate[]|null>(null);
  const [applied,setApplied] = useState<string|null>(null);
  const disruption = useMemo(()=>({airportId,start:toMinutes(start),duration}),[airportId,start,duration]);
  const run = (d=disruption, overrides:SimulationOverrides={}) => { const next=simulate(network,d,overrides); setResult(next); setSelected(null); setRecoveries(null); setApplied(null); };
  const reset = () => { setResult(null); setSelected(null); setRecoveries(null); setApplied(null); setFilter('all'); };
  const demos = [
    {label:'Monsoon disruption', airport:airports[0]?.id, start:'08:00', duration:180},
    {label:'Peak-hour squeeze', airport:airports[1]?.id ?? airports[0]?.id, start:'17:00', duration:90},
    {label:'Short closure', airport:airports[2]?.id ?? airports[0]?.id, start:'12:00', duration:45}
  ];
  const rows = [...(result?.flights ?? [])].filter(f=>filter==='all'||f.status==='delayed').sort((a,b)=>sort==='delay'?b.delayMin-a.delayMin:sort==='flight'?a.flight_id.localeCompare(b.flight_id):a.schedDep-b.schedDep);
  const chosen = result?.flights.find(f=>f.flight_id===selected);
  const city = (id:string) => airports.find(a=>a.id===id)?.city ?? id;
  const selectedAirport = airports.find(a=>a.id===airportId);
  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Plane size={19}/></div><div><div className="brand-name">DOMINO <span>SKY</span></div><div className="brand-sub">AIRLINE DISRUPTION CONTROL</div></div></div><div className="live-tag"><span className="pulse"/> LOCAL SIMULATION <span className="tag-divider">/</span> NO LIVE DATA</div></header>
    <section className="hero"><div><div className="eyebrow"><span className="eyebrow-line"/> OPERATIONS INTELLIGENCE</div><h1>When one airport stops,<br/><em>the network feels it.</em></h1><p>Model disruption. Trace the cascade. Recover the passengers.</p></div><div className="hero-stamp"><Wind size={18}/><span>DISRUPTION<br/>SIMULATOR</span><b>01 / 01</b></div></section>
    {empty ? <section className="missing panel" role="alert"><div className="missing-icon"><ShieldAlert/></div><div><h2>Flight network data required</h2><p><strong>src/data/flight_network.json</strong> is not present yet. Add your supplied dataset at this exact path. This build intentionally does not generate sample airports or flights.</p><p className="muted">Expected top-level arrays: airports, flights, connections, crews, spare_aircraft.</p></div></section> : <>
      <section className="workspace">
        <div className="panel controls"><div className="panel-head"><div><div className="eyebrow">01 / SET THE SCENE</div><h2>Disruption controls</h2></div><button className="icon-button" onClick={reset} aria-label="Reset simulation" title="Reset"><RotateCcw size={16}/></button></div>
          <label className="field-label" htmlFor="airport">Airport closure</label><select id="airport" value={airportId} onChange={e=>setAirportId(e.target.value)}>{airports.map(a=><option key={a.id} value={a.id}>{a.id} — {a.city}</option>)}</select>
          <div className="two-fields"><div><label className="field-label" htmlFor="start">Closure starts</label><input id="start" type="time" value={start} onChange={e=>setStart(e.target.value)}/></div><div><label className="field-label" htmlFor="duration">Duration</label><div className="duration-box"><strong>{displayMinutes(duration)}</strong></div></div></div>
          <input className="range" id="duration" aria-label="Closure duration in minutes" type="range" min="15" max="360" step="15" value={duration} onChange={e=>setDuration(Number(e.target.value))}/><div className="range-labels"><span>15 MIN</span><span>6 HOURS</span></div>
          <button className="primary-button" onClick={()=>run()}><Activity size={16}/> Simulate disruption <ArrowRight size={16}/></button>
          <div className="demo-title">ONE-CLICK SCENARIOS <span>·</span></div><div className="demo-list">{demos.map((d,i)=><button key={d.label} className="demo-button" onClick={()=>{if(d.airport){setAirportId(d.airport);setStart(d.start);setDuration(d.duration);run({airportId:d.airport,start:toMinutes(d.start),duration:d.duration});}}}><span className="demo-number">0{i+1}</span>{d.label}<ArrowRight size={14}/></button>)}</div>
        </div>
        <div className="panel map-panel"><div className="panel-head"><div><div className="eyebrow">02 / NETWORK VIEW</div><h2>Flight network</h2></div><div className="map-count">{airports.length} AIRPORTS <span>·</span> {network.flights.length} FLIGHTS</div></div><NetworkMap airports={airports} flights={result?.flights ?? network.flights.map(f=>({...f,delayMin:0,status:'on-time' as const}))} closure={result?airportId:null} selected={selected} onSelect={setSelected}/><div className="legend"><span><i className="dot green"/> On time</span><span><i className="dot amber"/> Delayed</span><span><i className="dot red"/> Cancelled</span><span className="legend-note">LINE LABELS = FLIGHT ID</span></div></div>
      </section>
      <section className="metrics-grid" aria-live="polite" aria-label="Simulation metrics">{[
        {label:'Delayed flights',value:fmt(result?.metrics.delayedFlights??0),unit:'FLIGHTS',icon:<Timer/>,tone:'amber'},
        {label:'Total delay',value:fmt(result?.metrics.totalDelayMinutes??0),unit:'MINUTES',icon:<Activity/>,tone:'blue'},
        {label:'Stranded passengers',value:fmt(result?.metrics.strandedPassengers??0),unit:'PAX',icon:<Users/>,tone:'red'},
        {label:'Crew violations',value:fmt(result?.metrics.crewViolations??0),unit:'DUTY FLAGS',icon:<ShieldAlert/>,tone:'violet'}
      ].map(m=><div className="metric-card" key={m.label}><div className={`metric-icon ${m.tone}`}>{m.icon}</div><div className="metric-label">{m.label}</div><div className="metric-value">{m.value}<small>{m.unit}</small></div><div className="metric-foot">{result?'SIMULATION RESULT':'AWAITING SIMULATION'}</div></div>)}</section>
      <section className="panel table-panel"><div className="panel-head table-heading"><div><div className="eyebrow">03 / FLIGHT OPERATIONS</div><h2>Rotation timeline</h2></div><div className="table-tools"><div className="filter-switch" role="group" aria-label="Filter flights"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All flights</button><button className={filter==='delayed'?'active':''} onClick={()=>setFilter('delayed')}>Delayed</button></div><label className="sr-only" htmlFor="sort">Sort flights</label><select id="sort" className="sort-select" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="time">Sort: Time</option><option value="delay">Sort: Delay</option><option value="flight">Sort: Flight ID</option></select></div></div>
        <div className="table-scroll"><table><thead><tr><th>FLIGHT</th><th>TAIL</th><th>ROUTE</th><th>SCHEDULED</th><th>NEW DEP</th><th>DELAY</th><th>STATUS</th></tr></thead><tbody>{rows.map(f=><tr key={f.flight_id} onClick={()=>setSelected(f.flight_id)} onKeyDown={e=>e.key==='Enter'&&setSelected(f.flight_id)} tabIndex={0} aria-label={`View cause for ${f.flight_id}`} className={`${selected===f.flight_id?'selected-row':''} clickable-row`}><td className="flight-id">{f.flight_id}</td><td>{f.tail_id}</td><td>{f.origin} <span className="route-arrow">→</span> {f.destination}</td><td>{f.dep}</td><td className="new-time">{result?f.newDep:'—'}</td><td className={f.delayMin?'delay-value':''}>{f.delayMin?`+${f.delayMin}m`:'—'}</td><td><span className={`status ${f.status}`}>{f.status}</span></td></tr>)}</tbody></table>{rows.length===0&&<div className="empty-state">No flights match this filter.</div>}</div>
        {chosen&&<div className="cause-panel" aria-live="polite"><div className="cause-head"><div><div className="eyebrow">CAUSE TRACE / {chosen.flight_id}</div><h3>Why is this flight late?</h3></div><button className="close-button" onClick={()=>setSelected(null)} aria-label="Close cause trace">×</button></div><div className="cause-summary"><span className={`status ${chosen.status}`}>{chosen.status}</span><strong>{chosen.delayMin?`+${chosen.delayMin} minutes`:'No departure delay'}</strong></div><ol className="cause-chain">{chosen.causeChain.map((step,i)=><li key={i}><span>{String(i+1).padStart(2,'0')}</span>{step}</li>)}</ol></div>}
      </section>
      <section className="recovery-section"><div className="recovery-intro"><div><div className="eyebrow">04 / DISRUPTION MITIGATION</div><h2>Find a way back.</h2><p>Test cancellations and available spare aircraft against the current network state.</p></div><button className="recovery-button" disabled={!result} onClick={()=>setRecoveries(recoveryOptions(network,disruption,result!))}><Sparkles size={16}/> Recommend recovery</button></div>
        {recoveries&&<div className="recovery-grid">{recoveries.map((candidate,i)=><RecoveryCard key={candidate.action.id} candidate={candidate} rank={i+1} onApply={()=>{const overrides=candidate.action.type==='cancel'?{cancelledFlightIds:[candidate.action.flightId]}:{swaps:{[candidate.action.flightId]:candidate.action.spareTail!}};run(disruption,overrides);setApplied(candidate.action.id);}}/> )}{recoveries.length===0&&<div className="empty-state">No recovery candidates are available from the supplied spare-aircraft data.</div>}</div>}
      </section>
      <section className="gemini-note"><div className="gemini-icon"><Sparkles size={17}/></div><div><strong>OPTIONAL / GEMINI EXPLANATION HOOK</strong><p>Deterministic recovery explanations run locally. A future server endpoint can add Gemini-generated narrative without exposing an API key in the browser. No AI service is required for this app.</p></div><span className="hook-status">NOT CONNECTED</span></section>
    </>}
    <footer><span>DOMINO SKY <b>·</b> LOCAL-FIRST OPERATIONS LAB</span><span>DETERMINISTIC ENGINE <b>·</b> NO EXTERNAL API</span></footer>
  </main>;
}

function NetworkMap({airports,flights,closure,selected,onSelect}:{airports:FlightNetwork['airports'];flights:(FlightResult|FlightNetwork['flights'][number])[];closure:string|null;selected:string|null;onSelect:(id:string)=>void}) {
  const lats=airports.map(a=>a.lat), lngs=airports.map(a=>a.lng); const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  const pos=(id:string)=>{const a=airports.find(x=>x.id===id);if(!a)return{x:0,y:0};return{x:55+(a.lng-minLng)/Math.max(0.01,maxLng-minLng)*690,y:45+(maxLat-a.lat)/Math.max(0.01,maxLat-minLat)*300};};
  return <svg className="network-svg" viewBox="0 0 800 390" role="img" aria-label="Airport network map with flight routes and status labels"><defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#263746" strokeWidth=".6"/></pattern></defs><rect width="800" height="390" fill="url(#grid)"/>
    {flights.map((f:any)=>{const a=pos(f.origin),b=pos(f.destination);const color=f.status==='delayed'?'#e9aa56':f.status==='cancelled'?'#ed6b68':'#54c6a2';const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-14;return <g key={f.flight_id} className="map-route" onClick={()=>onSelect(f.flight_id)} tabIndex={0} role="button" aria-label={`${f.flight_id}, ${f.status}`}><path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} stroke={color} strokeWidth={selected===f.flight_id?3:1.5} strokeDasharray={f.status==='cancelled'?'5 5':'none'} fill="none" opacity={selected && selected!==f.flight_id ? .28 : .8}/><text x={mx} y={my-5} fill={color} textAnchor="middle" fontSize="9" fontWeight="700">{f.flight_id}</text></g>})}
    {airports.map(a=>{const p=pos(a.id);return <g key={a.id}><circle cx={p.x} cy={p.y} r={closure===a.id?13:9} fill={closure===a.id?'#ed6b68':'#122433'} stroke={closure===a.id?'#ed6b68':'#54c6a2'} strokeWidth="1.5"/><circle cx={p.x} cy={p.y} r="3" fill="#eaf2f5"/><text x={p.x} y={p.y+25} fill="#d6e1e8" textAnchor="middle" fontSize="11" fontWeight="700">{a.id}</text><text x={p.x} y={p.y+38} fill="#718594" textAnchor="middle" fontSize="9">{a.city}</text></g>})}
  </svg>;
}
function RecoveryCard({candidate,rank,onApply}:{candidate:RecoveryCandidate;rank:number;onApply:()=>void}) {const beforeStranded=candidate.result.metrics.strandedPassengers+candidate.passengersSaved;const beforeDelay=candidate.result.metrics.totalDelayMinutes+candidate.delayMinutesSaved;return <article className="recovery-card"><div className="recovery-card-top"><span className="rank">0{rank} / RECOMMENDATION</span><span className="saved">{candidate.passengersSaved} PAX SAVED</span></div><h3>{candidate.action.label}</h3><div className="before-after"><div><span>BEFORE</span><strong>{beforeStranded.toLocaleString()}<small>stranded</small></strong><strong>{beforeDelay.toLocaleString()}<small>delay min</small></strong></div><ArrowRight size={17}/><div><span>AFTER</span><strong>{candidate.result.metrics.strandedPassengers.toLocaleString()}<small>stranded</small></strong><strong>{candidate.result.metrics.totalDelayMinutes.toLocaleString()}<small>delay min</small></strong></div></div><p>{candidate.explanation}</p><button className="apply-button" onClick={onApply}>Apply recovery <ArrowRight size={15}/></button></article>}
