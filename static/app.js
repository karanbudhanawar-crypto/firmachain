const $ = (id) => document.getElementById(id);
const APPROVED_HASH = "8c56072cc0880a003fea6cb37b4b553c1b4cd525d66edb5518ac83a9d03eb6b1";
const MISMATCH_HASH = "a".repeat(64);
const REVOKED_HASH = "b".repeat(64);
const VIOLATION_HASH = "c".repeat(64);
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function pill(value){const s=String(value||"unknown").toLowerCase();return `<span class="pill ${esc(s)}">${esc(value||"unknown")}</span>`;}
async function api(path, options={}){const r=await fetch(path,{headers:{"Content-Type":"application/json",...(options.headers||{})},...options});const data=await r.json().catch(()=>({detail:r.statusText}));if(!r.ok)throw new Error(data.detail||"Request failed");return data;}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),3500);}
async function loadAll(){try{const [health,metrics,devices,releases,incidents,audit]=await Promise.all([api("/api/health"),api("/api/metrics"),api("/api/devices"),api("/api/releases"),api("/api/incidents"),api("/api/audit")]);$("health").textContent=health.status==="ok"?"Backend online":"Backend issue";$("m-devices").textContent=metrics.devices;$("m-isolated").textContent=metrics.isolated_devices;$("m-suspicious").textContent=metrics.suspicious_devices;$("m-audit").textContent=audit.chain_valid?"VALID":"INVALID";$("m-audit").style.color=audit.chain_valid?"var(--cyan)":"var(--red)";
$("devices").innerHTML=devices.length?devices.map(d=>`<tr><td><span class="device-name">${esc(d.name)}</span><span class="subline">${esc(d.id)}</span></td><td>${esc(d.firmware_version)}<span class="subline">${esc((d.reported_hash||"").slice(0,12))}…</span></td><td>${pill(d.status)}</td><td>${pill(d.network_state)}</td><td>${esc(d.last_decision)}</td></tr>`).join(""):`<tr><td colspan="5">No devices yet. Run a simulator scenario.</td></tr>`;
$("releases").innerHTML=releases.length?releases.map(r=>`<div class="release"><div class="release-top"><strong>${esc(r.version)} · ${esc(r.id)}</strong>${pill(r.revoked?"revoked":r.approved?"approved":"pending")}</div><code>${esc(r.sha256)}</code><small>${esc(r.notes)}</small>${!r.revoked?`<div style="margin-top:9px"><button class="danger revoke" data-id="${esc(r.id)}">Revoke release</button></div>`:""}</div>`).join(""):"No releases registered.";
$("incidents").innerHTML=incidents.length?incidents.slice(0,12).map(i=>`<div class="incident"><div class="incident-top"><strong>${esc(i.event_type.replaceAll("_"," "))}</strong>${pill(i.severity)}</div><small>${esc(i.device_id)} · ${esc(i.created_at||"")}</small><p>${esc(i.details)}</p></div>`).join(""):"<p class='hint'>No incidents recorded.</p>";
$("audit-status").textContent=`${audit.chain_valid?"Audit hash chain is valid":"Audit hash chain verification failed"} · ${audit.count} entries`;
$("audit").innerHTML=audit.entries.slice(-5).reverse().map(a=>`<div class="audit-entry"><div class="event">${esc(a.event_type.replaceAll("_"," "))}</div><div class="meta">Entry #${a.id} · ${esc(a.created_at||"")}</div><code>${esc(a.entry_hash)}</code></div>`).join("")||"<p class='hint'>No audit entries.</p>";
document.querySelectorAll(".revoke").forEach(b=>b.addEventListener("click",async()=>{if(!confirm(`Revoke release ${b.dataset.id}?`))return;try{await api(`/api/releases/${encodeURIComponent(b.dataset.id)}/revoke`,{method:"POST"});toast("Release revoked");loadAll()}catch(e){toast(e.message)}}));
}catch(e){$("health").textContent="Backend unavailable";toast(e.message)}}
async function simulate(hash,violation,note){try{const res=await api("/api/reports",{method:"POST",body:JSON.stringify({device_id:"esp32-lab-01",firmware_version:"1.0.0-demo",firmware_hash:hash,security_violation:violation,note})});toast(`Decision: ${res.decision} · ${res.verification_latency_ms} ms`);loadAll()}catch(e){toast(e.message)}}
$("refresh").onclick=loadAll;$("audit-refresh").onclick=loadAll;
$("demo-approved").onclick=()=>simulate(APPROVED_HASH,false,"Dashboard approved scenario");
$("demo-mismatch").onclick=()=>simulate(MISMATCH_HASH,false,"Dashboard mismatch scenario");
$("demo-revoked").onclick=async()=>{try{await api("/api/releases",{method:"POST",body:JSON.stringify({release_id:"revoked-demo",version:"0.9.0",sha256:REVOKED_HASH,notes:"Demo revoked release"})});await api("/api/releases/revoked-demo/revoke",{method:"POST"});}catch(e){if(!String(e.message).includes("already exists"))toast(e.message)}simulate(REVOKED_HASH,false,"Dashboard revoked firmware scenario");};
$("demo-violation").onclick=()=>simulate(VIOLATION_HASH,true,"Simulated confirmed security violation");
$("release-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const body=Object.fromEntries(f.entries());try{await api("/api/releases",{method:"POST",body:JSON.stringify(body)});$("release-msg").textContent="Release added to the prototype registry.";e.currentTarget.reset();toast("Release registered");loadAll()}catch(err){$("release-msg").textContent=err.message}});
loadAll();setInterval(loadAll,15000);

/* Supplementary status labels used by the redesigned console */
async function syncConsoleStatus(){
  try{
    const [h,m,a]=await Promise.all([api("/api/health"),api("/api/metrics"),api("/api/audit")]);
    const apiLabel=$("system-api"), dbLabel=$("system-db"), auditLabel=$("system-audit"), top=$("top-health");
    if(apiLabel)apiLabel.textContent=h.status==="ok"?"Online":"Unavailable";
    if(dbLabel)dbLabel.textContent="Connected";
    if(auditLabel)auditLabel.textContent=a.chain_valid?"Valid":"Invalid";
    if(top)top.textContent=h.status==="ok"?"Backend online":"Backend issue";
  }catch(e){
    const apiLabel=$("system-api"), dbLabel=$("system-db"), auditLabel=$("system-audit"), top=$("top-health");
    if(apiLabel)apiLabel.textContent="Unavailable";
    if(dbLabel)dbLabel.textContent="Unknown";
    if(auditLabel)auditLabel.textContent="Unknown";
    if(top)top.textContent="Backend unavailable";
  }
}
syncConsoleStatus();
setInterval(syncConsoleStatus,15000);
