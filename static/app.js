const $ = (id) => document.getElementById(id);
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function pill(value){const s=String(value||"unknown").toLowerCase();return `<span class="pill ${esc(s)}">${esc(value||"unknown")}</span>`;}
async function api(path,options={}){const r=await fetch(path,{headers:{"Content-Type":"application/json",...(options.headers||{})},...options});const data=await r.json().catch(()=>({detail:r.statusText}));if(!r.ok)throw new Error(data.detail||"Request failed");return data;}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3500);}
function setText(id,value){const el=$(id);if(el)el.textContent=value;}
function setDot(id,ok){const el=$(id);if(el)el.classList.toggle("is-offline",!ok);}
function formatDate(value){if(!value)return "No report received yet";const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString();}
function renderDevice(hw){
 const d=hw.device;
 const online=!!hw.connected;
 setText("top-health",online?"ESP32-S3 connected":"Waiting for ESP32-S3");
 setText("health",online?"Hardware connected":"Waiting for device");
 setText("hero-device-state",online?"ESP32-S3 online":"Waiting for device");
 setText("hero-device-sub",online?"Recent firmware report received":"Connect board and start USB bridge");
 setText("hardware-badge",online?"Connected":"Not connected");
 setText("device-name",hw.device_id||"esp32-s3-usb-01");
 setText("device-transport",hw.transport||"USB serial via host bridge");
 setText("device-last-seen",online?"Last report: "+formatDate(hw.last_seen):(hw.last_seen?"Last seen "+formatDate(hw.last_seen):"No report received yet"));
 setText("connection-label",online?"ONLINE":"OFFLINE");
 setText("flow-device-state",online?"Reporting":"Waiting");
 setText("m-devices",online?"1":"0");
 setText("m-isolated",online&&d&&d.network_state==="isolated"?"1":"0");
 const badge=$("hardware-badge");if(badge){badge.classList.toggle("online-badge",online);badge.classList.toggle("offline-badge",!online);}
 const cd=$("connection-dot");if(cd)cd.classList.toggle("is-offline",!online);
 const hp=$("hardware-pulse");if(hp)hp.classList.toggle("is-offline",!online);
 if(d){
  setText("device-firmware",d.firmware_version||"Unknown");
  setText("device-hash",d.reported_hash||"Unavailable");
  setText("device-decision",d.last_decision||d.status||"Awaiting decision");
 }else{
  setText("device-firmware","—");setText("device-hash","Waiting for report");setText("device-decision","Awaiting firmware report");
 }
}
async function loadAll(){
 try{
  const [health,metrics,releases,incidents,audit,hw]=await Promise.all([
   api("/api/health"),api("/api/metrics"),api("/api/releases"),api("/api/incidents"),api("/api/audit"),api("/api/hardware/status")
  ]);
  renderDevice(hw);
  setText("m-suspicious",incidents.filter(i=>i.device_id==="esp32-s3-usb-01"&&["medium","high","critical"].includes(String(i.severity).toLowerCase())).length);
  setText("m-audit",audit.chain_valid?"VALID":"INVALID");
  const auditMetric=$("m-audit");if(auditMetric)auditMetric.style.color=audit.chain_valid?"var(--cyan)":"var(--red)";
  setText("system-api",health.status==="ok"?"Online":"Unavailable");
  setText("system-db","Connected");
  setText("system-audit",audit.chain_valid?"Valid":"Invalid");
  setDot("api-dot",health.status==="ok");setDot("db-dot",true);setDot("audit-dot",audit.chain_valid);
  setText("audit-status",`${audit.chain_valid?"Audit hash chain is valid":"Audit hash chain verification failed"} · ${audit.count} entries`);
  const trustedReleases=releases.filter(r=>!String(r.id).includes("revoked-demo"));
  setText("release-count",trustedReleases.length+` release${trustedReleases.length===1?"":"s"}`);
  $("releases").innerHTML=trustedReleases.length?trustedReleases.map(r=>`<div class="release"><div class="release-top"><strong>${esc(r.version)} · ${esc(r.id)}</strong>${pill(r.revoked?"revoked":r.approved?"approved":"pending")}</div><code>${esc(r.sha256)}</code><small>${esc(r.notes||"")}</small>${!r.revoked?`<div class="release-actions"><button class="danger revoke" data-id="${esc(r.id)}">Revoke release</button></div>`:""}</div>`).join(""):"<p class='empty-state'>No firmware releases registered yet.</p>";
  $("incidents").innerHTML=incidents.filter(i=>i.device_id==="esp32-s3-usb-01").slice(0,10).map(i=>`<div class="incident"><div class="incident-top"><strong>${esc(String(i.event_type).replaceAll("_"," "))}</strong>${pill(i.severity)}</div><small>${esc(formatDate(i.created_at))}</small><p>${esc(i.details)}</p></div>`).join("")||'<p class="empty-state">No hardware incidents recorded. Connect the ESP32 and send a firmware report to begin monitoring.</p>';
  $("audit").innerHTML=audit.entries.slice(-6).reverse().map(a=>`<div class="audit-entry"><div class="event">${esc(String(a.event_type).replaceAll("_"," "))}</div><div class="meta">Entry #${a.id} · ${esc(formatDate(a.created_at))}</div><code>${esc(a.entry_hash)}</code></div>`).join("")||'<p class="empty-state">No audit entries available.</p>';
  document.querySelectorAll(".revoke").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Revoke firmware release "+b.dataset.id+"?"))return;try{await api("/api/releases/"+encodeURIComponent(b.dataset.id)+"/revoke",{method:"POST"});toast("Release revoked");await loadAll();}catch(e){toast(e.message);}}));
 }catch(e){setText("top-health","Backend unavailable");setText("health","Backend unavailable");setText("system-api","Unavailable");toast(e.message);}
}
$("refresh").onclick=loadAll;
$("audit-refresh").onclick=async()=>{try{const a=await api("/api/audit");setText("audit-status",`${a.chain_valid?"Audit hash chain is valid":"Audit hash chain verification failed"} · ${a.count} entries`);toast(a.chain_valid?"Audit chain verified":"Audit chain verification failed");await loadAll();}catch(e){toast(e.message);}};
$("release-form").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget).entries());try{await api("/api/releases",{method:"POST",body:JSON.stringify(body)});setText("release-msg","Firmware release registered.");toast("Release registered");e.currentTarget.reset();await loadAll();}catch(err){setText("release-msg",err.message);}});
loadAll();setInterval(loadAll,5000);

/* Search currently rendered registry, incidents and audit records without altering server data. */
const globalSearch = $("global-search");
if(globalSearch){
  globalSearch.addEventListener("input",()=>{
    const q=globalSearch.value.trim().toLowerCase();
    document.querySelectorAll("#releases .release, #incidents .incident, #audit .audit-entry").forEach(card=>{
      card.hidden=!!q&&!card.textContent.toLowerCase().includes(q);
    });
    const hw=$("hardware-panel");
    if(hw)hw.classList.toggle("search-match",!!q&&hw.textContent.toLowerCase().includes(q));
  });
}
