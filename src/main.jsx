import Admin from './Admin.jsx';
import ExternalRefueling from './ExternalRefueling.jsx';
import React,{useEffect,useRef,useState} from 'react';import{createRoot}from'react-dom/client';import{createClient}from'@supabase/supabase-js';import{Fuel,ClipboardList,LockKeyhole,PlusCircle,LayoutDashboard,Plane,RefreshCw}from'lucide-react';import './style.css';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;const configured=!!(url&&key&&!url.includes('YOUR_PROJECT'));const supabase=configured?createClient(url,key):null;const planes=['D-ELLH','D-EVFM','PH-BAJ','D-ELCH'];const fmt=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:2});const tankFromUrl=()=>new URLSearchParams(location.search).get('tank');const qrParams = new URLSearchParams(window.location.search);
const qrTank = qrParams.get('tank');
const qrToken = qrParams.get('token') || '';

const validQrLink =
  ['doppelachser', 'einachser'].includes(qrTank) &&
  /^[0-9a-f]{64}$/i.test(qrToken);
function parseMeter(value) {
  const text = String(value).trim().replace(/\s/g, '');

  if (!text) return NaN;

  // Deutsche Schreibweise: 12.550,5
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)) {
    return Number(text.replace(/\./g, '').replace(',', '.'));
  }

  // Ohne Tausendertrennzeichen: 12550 oder 12550,5
  if (/^\d+(?:[,.]\d{1,2})?$/.test(text)) {
    return Number(text.replace(',', '.'));
  }

  return NaN;
}
function App(){const [loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[tanks,setTanks]=useState([]),[history,setHistory]=useState([]),[names,setNames]=useState([]),[selected,setSelected]=useState(tankFromUrl()==='einachser'?'einachser':'doppelachser'),[tab,setTab]=useState('fuel'),[operator,setOperator]=useState(''),[newOperator,setNewOperator]=useState(''),[plane,setPlane]=useState('D-ELLH'),[otherPlane,setOtherPlane]=useState(''),[meter,setMeter]=useState(''),[amount,setAmount]=useState(''),[override,setOverride]=useState(''),[refillPassword,setRefillPassword]=useState(''),[unlocked,setUnlocked]=useState(false),[confirm,setConfirm]=useState(false);
const fuelRequest=useRef(null);const refillRequest=useRef(null);const busy=useRef(false);const [ready,setReady]=useState(false);const tank=tanks.find(t=>t.slug===selected);const name=(operator==='__new__'?newOperator:operator).trim();const callSign=(plane==='__other__'?otherPlane:plane).trim().toUpperCase();const dispensed=meter.trim()?parseMeter(meter)-Number(tank?.meter??0):NaN;const fuelStock=Number(tank?.stock??0)-dispensed;const added=amount.trim()?Number(amount):NaN;const calculated=Number(tank?.stock??0)+added;const finalStock=override.trim()?Number(override):calculated;

async function load(){
 if(!supabase||!validQrLink)return false;
 try {
 const {data,error}=await supabase.functions.invoke('tank-data',{body:{tank_id:qrTank==='einachser'?2:1,qr_token:qrToken}});
 if(error||!data?.success||!data.tank)throw new Error('Tankdaten nicht verfügbar. Bitte QR-Code und Verbindung prüfen.');
 setTanks([data.tank]);setNames(data.operators||[]);setReady(true);return true;
 }catch(err){setReady(false);setError(err.message);return false;}
}
useEffect(()=>{load()},[]);
function clear(){setOperator('');setNewOperator('');setMeter('');setAmount('');setOverride('');setConfirm(false);setNotice('');setError('')}function go(t){if(busy.current)return;if(tab==='admin'&&t!=='admin')load();setTab(t);clear();if(t!=='refill'){setUnlocked(false);setRefillPassword('')}}function choose(slug){
  if(slug!==qrTank)return;
  setSelected(slug);
  clear();
}
async function saveBooking(e,kind){
 e.preventDefault();
 if(busy.current||!ready||!tank||!confirm||!name)return;
 const ref=kind==='fuel'?fuelRequest:refillRequest;
 const payload=kind==='fuel'?{tank_id:tank.id,operator:name,aircraft:callSign,new_meter:parseMeter(meter)}:{action:'refill',tank_id:tank.id,operator:name,amount:added,corrected_stock:override.trim()?Number(override):null};
 if(kind==='fuel'&&(!callSign||!Number.isFinite(dispensed)||dispensed<=0))return;
 if(kind==='refill'&&(!unlocked||!Number.isFinite(added)||added<=0||added>100000||!Number.isFinite(finalStock)||(override.trim()&&finalStock<0)))return;
 const signature=JSON.stringify(payload);
 if(ref.current&&ref.current.signature!==signature){setError('Vorheriger Vorgang nicht bestätigt. Bitte ursprüngliche Angaben erneut senden.');return;}
 if(!ref.current)ref.current={signature,id:crypto.randomUUID()};
 busy.current=true;setLoading(true);setError('');
 try{
 const {data,error}=await supabase.functions.invoke(kind,{body:{...payload,request_id:ref.current.id,qr_token:qrToken,...(kind==='refill'?{password:refillPassword}:{})}});
 if(error||data?.error){
 let message=data?.error||error?.message||'Speicherung nicht bestätigt';
 const status=error?.context?.status;
 try{const details=await error?.context?.json();if(details?.error)message=details.error;}catch{}
 if([400,403,404].includes(status))ref.current=null;
 setError(message);return;
 }
 if(!data?.saved){setError('Keine eindeutige Bestätigung. Bitte unverändert erneut senden.');return;}
 ref.current=null;clear();setTab('overview');setUnlocked(false);setRefillPassword('');
 const refreshed=await load();
 setNotice((kind==='fuel'?'Betankung':'Tankauffüllung')+' erfolgreich gespeichert.'+(data.warning?' Hinweis: '+data.warning:'')+(!refreshed?' Tankdaten bitte neu laden.':''));
 }catch{setError('Verbindung unterbrochen. Bitte denselben Vorgang unverändert erneut senden.');}
 finally{busy.current=false;setLoading(false);}
}
const saveFuel=e=>saveBooking(e,'fuel');
const saveRefill=e=>saveBooking(e,'refill');
if(!validQrLink){
  return (
    <main className="shell">
      <div className="panel">
        <h1>Tankverwaltung VfM Klausheide</h1>
        <p>
          Bitte scanne den QR-Code am jeweiligen Tank,
          um eine Betankung zu erfassen.
        </p>
      </div>
    </main>
  );
}if(!configured)return <main className="shell"><div className="panel"><h1>Tankverwaltung</h1><p>Die Datenbank ist noch nicht konfiguriert. Bitte die Datei <code>.env</code> gemäß <code>.env.example</code> ausfüllen und das Supabase-Schema installieren.</p><p>Siehe README.md für die Einrichtung.</p></div></main>;
return <><header><div className="shell head"><div><div className="brand"><Fuel/> Tankverwaltung</div><span>Flugplatz · Kraftstoffmanagement</span></div></div></header><main className="shell"><nav>{[['overview',LayoutDashboard,'Übersicht'],['fuel',Fuel,'Betanken'],['refill',LockKeyhole,'Tank auffüllen'],['admin',LockKeyhole,'Admin']].map(([id,Icon,label])=><button key={id} className={tab===id?'active':''} disabled={loading||!!fuelRequest.current||!!refillRequest.current} onClick={()=>go(id)}><Icon size={19}/><span>{label}</span></button>)}</nav><section className="tankgrid">{tanks.map(t=><button key={t.id} className={'tankcard '+(selected===t.slug?'selected':'')} onClick={()=>choose(t.slug)}><span className="tankname">{t.name}</span><strong style={{color:t.stock<0?'#dc2626':undefined}}>{fmt(t.stock)} L</strong><small>Pumpenzähler: {fmt(t.meter)} L</small></button>)}</section>{error&&<div className="error banner">{error}</div>}{notice&&<div className="success banner">{notice}</div>}
{tab==='overview'&&<div className="panel"><h2>Tankübersicht</h2><p>Ausgewählt: <b>{tank?.name||'–'}</b></p><div className="stats"><div><small>Tankbestand</small><strong style={{color:tank?.stock<0?'#dc2626':undefined}}>{tank?fmt(tank.stock):'–'} L</strong></div><div><small>Pumpenzähler</small><strong>{tank?fmt(tank.meter):'–'} L</strong></div></div><button onClick={()=>go('fuel')}>Neue Betankung erfassen</button></div>}
{!ready&&<div className="panel"><p>Tankdaten werden geladen oder sind nicht verfügbar.</p><button disabled={loading} onClick={()=>load()}>Erneut laden</button></div>}{ready&&(tab==='fuel'||tab==='refill')&&<div className="panel formpanel"><h2>{tab==='fuel'?'Flugzeug betanken':'Tank auffüllen'}</h2><p className="sub">{tank?.name}</p>{tab==='refill'&&!unlocked?
<form onSubmit={async e=>{
  e.preventDefault();
  if(busy.current||loading||!refillPassword||!tank)return;
 busy.current=true;

  setLoading(true);
  setError('');

  try{
    const {data,error}=await supabase.functions.invoke('refill',{
      body:{
        action:'check_password',
        tank_id:tank.id,
        qr_token:qrToken,
        password:refillPassword
      }
    });

    if(error||data?.error||data?.valid!==true){
      let message=data?.error||error?.message||'Passwortprüfung fehlgeschlagen';

      if(error?.context){
        try{
          const details=await error.context.json();
          if(details?.error)message=details.error;
        }catch(e){}
      }

      setUnlocked(false);
      setError(message);
    }else{
      setUnlocked(true);
      setError('');
    }
  }catch(err){
    setUnlocked(false);
    setError('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
  }finally{
    busy.current=false;setLoading(false);
  }
}}><label>Passwort für Tankauffüllung<input type="password" value={refillPassword} onChange={e=>setRefillPassword(e.target.value)} required autoComplete="off"/></label><button>Weiter</button><p className="hint">Das Passwort wird beim Klick auf „Weiter“ sicher auf dem Server geprüft. Nur bei korrektem Passwort wird das Auffüllformular freigeschaltet.</p></form>:<form onSubmit={tab==='fuel'?saveFuel:saveRefill}><fieldset disabled={loading} style={{border:0,padding:0,margin:0,minWidth:0}}><label>Betanker<select required value={operator} onChange={e=>setOperator(e.target.value)}><option value="">Namen auswählen</option>{names.map(n=><option key={n}>{n}</option>)}<option value="__new__">+ Neuen Namen eingeben</option></select></label>{operator==='__new__'&&<label>Neuer Name<input required value={newOperator} onChange={e=>setNewOperator(e.target.value)}/></label>}{tab==='fuel'?<><label>Flugzeug-Rufzeichen<select value={plane} onChange={e=>setPlane(e.target.value)}>{planes.map(p=><option key={p}>{p}</option>)}<option value="__other__">Anderes Rufzeichen</option></select></label>{plane==='__other__'&&<label>Rufzeichen eingeben<input required value={otherPlane} onChange={e=>setOtherPlane(e.target.value)}/></label>}<label>Neuer Pumpenzählerstand (Liter)<input type="text" inputMode="decimal" placeholder="z. B. 12.550,5" required value={meter} onChange={e=>setMeter(e.target.value)}/></label><div className="calculation"><div><span>Alter Zählerstand</span><b>{fmt(tank?.meter||0)} L</b></div><div><span>Getankte Menge</span><b>{Number.isFinite(dispensed)?fmt(dispensed):'–'} L</b></div><div><span>Neuer Tankbestand</span><b style={{color:fuelStock<0?'#dc2626':undefined}}>{Number.isFinite(fuelStock)?fmt(fuelStock):'–'} L</b></div></div></>:<><label>Nachgefüllte Menge (Liter)<input type="number" step="0.01" min="0.01" required value={amount} onChange={e=>{setAmount(e.target.value);setOverride('')}}/></label><div className="calculation"><div><span>Bisheriger Bestand</span><b>{fmt(tank?.stock||0)} L</b></div><div><span>Automatisch berechnet</span><b style={{color:calculated<0?'#dc2626':undefined}}>{Number.isFinite(calculated)?fmt(calculated):'–'} L</b></div></div><label>Neuer Bestand – manuelle Korrektur (optional)<input type="number" step="0.01" min="0" value={override} onChange={e=>setOverride(e.target.value)} placeholder={Number.isFinite(calculated)?String(calculated):''}/></label><div className="calculation"><div><span>Zu speichernder Bestand</span><b style={{color:finalStock<0?'#dc2626':undefined}}>{Number.isFinite(finalStock)?fmt(finalStock):'–'} L</b></div></div></>}{(tab==='fuel'?fuelStock:finalStock)<0&&<p style={{color:'#dc2626'}}>Achtung: Negativer rechnerischer Tankbestand. Bitte tatsächlichen Bestand prüfen und im Admin-Bereich korrigieren.</p>}<label className="check"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> Ich bestätige, dass alle Angaben korrekt sind.</label><button disabled={loading||!confirm||!name||(tab==='fuel'?!(callSign&&Number.isFinite(dispensed)&&dispensed>0):!(Number.isFinite(added)&&added>0&&Number.isFinite(finalStock)&&(!override.trim()||finalStock>=0)))}>{loading?'Speichere …':tab==='fuel'?'Betankung speichern':'Auffüllung speichern'}</button></fieldset></form>}</div>}
{ready&&<div hidden={tab!=='admin'}><Admin /></div>}</main></>}
const isExternal =
  new URLSearchParams(window.location.search)
    .get('external') === '1';

createRoot(document.getElementById('root')).render(
  isExternal ? <ExternalRefueling /> : <App />
);
