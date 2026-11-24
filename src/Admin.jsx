import React, {
  useEffect,
  useState,
  useRef
} from 'react';

import {
  Shield,
  Lock,
  LogOut,
  Clock,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';

import './style.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function adminRequest(body) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/admin`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    const error = new Error(
      data.error || 'Die Anfrage ist fehlgeschlagen.'
    );

    error.status = response.status;

    throw error;
  }

  return data;
}

function formatLiters(value) {
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function inputLiters(value) {
  return Number(value)
    .toFixed(2)
    .replace('.', ',');
}

function parseLiters(value) {
  const text = String(value).trim();

  if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) {
    return null;
  }

  const number = Number(
    text.replace(',', '.')
  );

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > 9999999999.99
  ) {
    return null;
  }

  return number;
}

function normalizeLiters(value) {
  const number = parseLiters(value);

  return number === null
    ? value
    : inputLiters(number);
}

function formatDate(value) {
  return new Date(value).toLocaleString(
    'de-DE',
    {
      timeZone: 'Europe/Berlin',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }
  );
}

function TankManagement({
  tankId,
  session,
  connectionOk,
  onBack,
  onSessionInvalid
}) {
  const [tank, setTank] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [newStock, setNewStock] = useState('');
  const [newMeter, setNewMeter] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(null);

  const active = useRef(false);
  const busy = useRef(false);
  const requestRef = useRef(null);

  const tankName =
    tankId === 1
      ? 'Doppelachser'
      : 'Einachser';

  function handleError(err) {
    if (!active.current) return;

    if (
      err.status === 401 ||
      err.status === 403
    ) {
      onSessionInvalid();
      return;
    }

    setError(
      err.name === 'TimeoutError'
        ? 'Keine Antwort vom Server. Bitte erneut versuchen.'
        : err.message
    );
  }

  async function fetchTankData() {
    const [tankData, historyData] =
      await Promise.all([
        adminRequest({
          action: 'get_tanks',
          session_token: session.token
        }),
        adminRequest({
          action: 'get_corrections',
          session_token: session.token,
          tank_id: tankId
        })
      ]);

    const selectedTank = tankData.tanks.find(
      item => item.id === tankId
    );

    if (!selectedTank) {
      throw new Error(
        'Der ausgewählte Tank wurde nicht gefunden.'
      );
    }

    if (!active.current) return;

    setTank(selectedTank);

    setNewStock(
      Number(selectedTank.stock) < 0
        ? ''
        : inputLiters(selectedTank.stock)
    );

    setNewMeter(
      inputLiters(selectedTank.meter)
    );

    setCorrections(
      historyData.corrections || []
    );

    setReason('');
    setConfirmed(false);
  }

  async function loadData() {
    if (busy.current || requestRef.current) return;

    busy.current = true;

    setLoading(true);
    setError('');
    setNotice('');
    setTank(null);

    try {
      await fetchTankData();

    } catch (err) {
      handleError(err);

    } finally {
      busy.current = false;

      if (active.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    active.current = true;

    loadData();

    return () => {
      active.current = false;
    };
  }, [tankId, session.token]);

  const parsedStock = parseLiters(newStock);
  const parsedMeter = parseLiters(newMeter);

  const changed =
    tank !== null &&
    parsedStock !== null &&
    parsedMeter !== null &&
    (
      parsedStock !== Number(tank.stock) ||
      parsedMeter !== Number(tank.meter)
    );

  const canSave =
    connectionOk &&
    !loading &&
    !saving &&
    tank !== null &&
    changed &&
    reason.trim().length > 0 &&
    reason.trim().length <= 500 &&
    confirmed;

  async function saveCorrection(event) {
    event.preventDefault();

    if (
      busy.current ||
      !connectionOk ||
      loading ||
      saving
    ) {
      return;
    }

    let payload = requestRef.current;

    if (!payload) {
      if (!canSave) return;

      payload = {
        action: 'correct_tank',
        session_token: session.token,
        tank_id: tankId,
        expected_stock: Number(tank.stock),
        expected_meter: Number(tank.meter),
        new_stock: parsedStock,
        new_meter: parsedMeter,
        reason: reason.trim(),
        request_id: crypto.randomUUID()
      };

      requestRef.current = payload;
      setPending(payload);
    }

    busy.current = true;

    setSaving(true);
    setError('');
    setNotice('');

    try {
      await adminRequest(payload);

      if (!active.current) return;

      requestRef.current = null;

      setPending(null);
      setConfirmed(false);
      setReason('');
      setTank(null);

      setNotice(
        'Tankkorrektur erfolgreich gespeichert.'
      );

      try {
        await fetchTankData();

      } catch (err) {
        if (!active.current) return;

        if (
          err.status === 401 ||
          err.status === 403
        ) {
          onSessionInvalid();
          return;
        }

        setError(
          'Die Korrektur wurde gespeichert. Die aktuellen Tankdaten konnten jedoch nicht neu geladen werden. Bitte aktualisieren.'
        );
      }

    } catch (err) {
      if (!active.current) return;

      if (
        err.status === 401 ||
        err.status === 403
      ) {
        onSessionInvalid();
        return;
      }

      if (
        err.status === 400 ||
        err.status === 404 ||
        err.status === 409
      ) {
        requestRef.current = null;

        setPending(null);
        setConfirmed(false);

        if (
          err.status === 409 ||
          err.status === 404
        ) {
          setTank(null);
        }

        handleError(err);

      } else {
        setError(
          'Die Speicherung konnte nicht bestätigt werden. Bitte wiederhole dieselbe Anfrage. Eine doppelte Korrektur wird serverseitig verhindert.'
        );
      }

    } finally {
      busy.current = false;

      if (active.current) {
        setSaving(false);
      }
    }
  }

  const fieldsDisabled =
    !connectionOk ||
    loading ||
    saving ||
    pending !== null;

  return (
    <section>

      <button
        type="button"
        onClick={onBack}
        disabled={
          loading ||
          saving ||
          pending !== null
        }
        style={{
          width: '100%',
          marginBottom: '16px'
        }}
      >
        <ArrowLeft
          size={18}
          style={{
            verticalAlign: 'middle',
            marginRight: '6px'
          }}
        />
        Zurück zur Übersicht
      </button>

      <h3>{tankName} verwalten</h3>

      {error && (
        <div
          className="error banner"
          role="alert"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          className="success banner"
          role="status"
        >
          {notice}
        </div>
      )}

      <button
        type="button"
        onClick={loadData}
        disabled={
          !connectionOk ||
          loading ||
          saving ||
          pending !== null
        }
        style={{
          width: '100%',
          marginBottom: '16px'
        }}
      >
        <RefreshCw
          size={17}
          style={{
            verticalAlign: 'middle',
            marginRight: '6px'
          }}
        />
        Aktuelle Werte neu laden
      </button>

      {loading && (
        <p className="hint">
          Tankdaten werden geladen …
        </p>
      )}

      {tank && !loading && (
        <>

          <div className="calculation">
            <div>
              <span>Aktueller rechnerischer Tankinhalt</span>
              <b style={Number(tank.stock) < 0 ? { color: '#b91c1c' } : undefined}>
                {formatLiters(tank.stock)} L
              </b>
            </div>

            <div>
              <span>Aktueller Zählerstand</span>
              <b>
                {formatLiters(tank.meter)} L
              </b>
            </div>
          </div>

          {Number(tank.stock) < 0 && (
            <div className="error banner" role="alert">
              Negativer rechnerischer Tankbestand. Bitte den tatsächlichen
              Tankinhalt ermitteln und als nicht negativen Wert eingeben.
            </div>
          )}

          <form onSubmit={saveCorrection}>

            <label>
              Neuer Tankinhalt (Liter)

              <input
                type="text"
                inputMode="decimal"
                value={newStock}
                onChange={event => {
                  setNewStock(event.target.value);
                  setConfirmed(false);
                }}
                onBlur={() => {
                  setNewStock(
                    normalizeLiters(newStock)
                  );
                }}
                disabled={fieldsDisabled}
                maxLength={13}
                required
              />
            </label>

            <label>
              Neuer Zählerstand (Liter)

              <input
                type="text"
                inputMode="decimal"
                value={newMeter}
                onChange={event => {
                  setNewMeter(event.target.value);
                  setConfirmed(false);
                }}
                onBlur={() => {
                  setNewMeter(
                    normalizeLiters(newMeter)
                  );
                }}
                disabled={fieldsDisabled}
                maxLength={13}
                required
              />
            </label>

            {(
              parsedStock === null ||
              parsedMeter === null
            ) && (
              <p className="hint">
                Bitte gültige, nicht negative
                Werte mit höchstens zwei
                Nachkommastellen eingeben.
              </p>
            )}

            <label>
              Begründung der Korrektur *

              <textarea
                value={reason}
                onChange={event => {
                  setReason(event.target.value);
                  setConfirmed(false);
                }}
                placeholder="Grund der Änderung eingeben …"
                maxLength={500}
                rows={4}
                disabled={fieldsDisabled}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  font: 'inherit',
                  resize: 'vertical'
                }}
              />
            </label>

            <p
              className="hint"
              style={{ textAlign: 'right' }}
            >
              {reason.length}/500 Zeichen
            </p>

            {changed && (
              <div className="calculation">

                <div>
                  <span>Neuer Tankinhalt</span>
                  <b>
                    {formatLiters(parsedStock)} L
                  </b>
                </div>

                <div>
                  <span>Neuer Zählerstand</span>
                  <b>
                    {formatLiters(parsedMeter)} L
                  </b>
                </div>

              </div>
            )}

            <label
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: '10px',
                margin: '18px 0'
              }}
            >
              <input
                type="checkbox"
                checked={confirmed}
                onChange={event =>
                  setConfirmed(event.target.checked)
                }
                disabled={fieldsDisabled}
                required
                style={{
                  width: '20px',
                  height: '20px',
                  flexShrink: 0,
                  marginTop: '2px'
                }}
              />

              <span>
                Ich bestätige die neuen Werte
                und dass der Tank momentan
                nicht benutzt wird.
              </span>
            </label>

            <button
              type="submit"
              disabled={
                pending
                  ? !connectionOk || saving
                  : !canSave
              }
              style={{ width: '100%' }}
            >
              {saving
                ? 'Korrektur wird gespeichert …'
                : pending
                  ? 'Speicherung erneut prüfen'
                  : 'Korrektur speichern'}
            </button>

            {pending && (
              <p className="hint">
                Der Ausgang der Anfrage ist noch
                nicht bestätigt. Die Eingaben
                bleiben für eine sichere
                Wiederholung gesperrt.
              </p>
            )}

            <p className="hint">
              Manuelle Korrekturen werden separat
              protokolliert und nicht als
              Betankung oder Kraftstoffverbrauch
              erfasst.
            </p>

          </form>
        </>
      )}

      <hr
        style={{
          border: 0,
          borderTop: '1px solid #dbe3ed',
          margin: '24px 0'
        }}
      />

      <h3>Bisherige Korrekturen</h3>

      {!loading && tank && corrections.length === 0 && (
        <p className="hint">
          Für diesen Tank wurden bisher keine
          manuellen Korrekturen gespeichert.
        </p>
      )}

      {!loading && tank && corrections.map(item => (
        <div
          key={item.id}
          style={{
            border: '1px solid #dbe3ed',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '12px'
          }}
        >

          <strong>
            {formatDate(item.created_at)} Uhr
          </strong>

          <p className="hint">
            Korrektur Nr. {item.id}
          </p>

          <div
            style={{
              margin: '12px 0',
              overflowWrap: 'anywhere'
            }}
          >
            <b>Tankinhalt</b>

            <div>
              <span style={Number(item.old_stock) < 0 ? { color: '#b91c1c', fontWeight: 700 } : undefined}>
                {formatLiters(item.old_stock)}
              </span>
              {' → '}
              {formatLiters(item.new_stock)} L
            </div>
          </div>

          <div
            style={{
              margin: '12px 0',
              overflowWrap: 'anywhere'
            }}
          >
            <b>Zählerstand</b>

            <div>
              {formatLiters(item.old_meter)}
              {' → '}
              {formatLiters(item.new_meter)} L
            </div>
          </div>

          <b>Begründung</b>

          <p
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere'
            }}
          >
            {item.reason}
          </p>

          <p className="hint">
            Bearbeiter: {item.corrected_by}
          </p>

        </div>
      ))}

      {corrections.length === 100 && (
        <p className="hint">
          Es werden die letzten 100
          Korrekturen angezeigt.
        </p>
      )}

    </section>
  );
}

// Monatsbericht: Vorschau und bestätigter manueller Versand.
function ReportManagement({ session, connectionOk, onBack, onSessionInvalid, pendingRef }) {
  const currentMonth = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit'
  }).format(new Date());
  const [period, setPeriod] = useState(pendingRef.current?.period || currentMonth);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(pendingRef.current);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const running = useRef(false);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function request(action) {
    if (running.current || !connectionOk) return;
    if (action === 'preview' && (pendingRef.current || !/^\d{4}-\d{2}$/.test(period) || period > currentMonth)) return;
    if (action === 'send' && !pendingRef.current && (!preview || !confirmed || sent)) return;
    running.current = true;
    setBusy(true); setError(''); setNotice('');
    if (action === 'preview') { setPreview(null); setConfirmed(false); }
    let payload = { action, period, session_token: session.token, include_excel: false };
    if (action === 'send') {
      if (!pendingRef.current) pendingRef.current = { period, request_id: crypto.randomUUID() };
      setPending(pendingRef.current);
      payload = { ...payload, ...pendingRef.current, confirm_send: true };
    }
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/monthly-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
        body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(90000)
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) { if (active.current) onSessionInvalid(); return; }
        throw new Error(data.error || 'Anfrage fehlgeschlagen.');
      }
      if (action === 'send') {
        if (data.email_sent !== true) throw new Error('Versand nicht bestätigt.');
        pendingRef.current = null;
        if (!active.current) return;
        setPending(null); setSent(true); setConfirmed(false);
        setNotice(data.log_saved === false ? 'E-Mail angenommen, Versandprotokoll konnte nicht gespeichert werden. Nicht erneut senden.' : data.already_exists ? 'Dieser Bericht wurde bereits versendet.' : 'Monatsbericht wurde vom E-Mail-Dienst angenommen.');
      } else if (active.current) {
        if (data.preview !== true || data.period !== period || !data.summary) throw new Error('Ungültige Vorschau.');
        setPreview(data);
      }
    } catch (err) {
      if (active.current) setError(action === 'send' ? `${err.message} Versandstatus unklar oder Versand abgelehnt. Nur dieselbe Vorgangsnummer erneut prüfen; keinen neuen Versand starten.` : err.message);
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  const dateLabel = value => String(value).split('-').reverse().join('.');
  return <section>
    <button type="button" onClick={onBack} disabled={busy || !!pending} style={{width:'100%', marginBottom:16}}>Zurück zur Übersicht</button>
    <h3>Monatsbericht versenden</h3>
    <label>Berichtsmonat<input type="month" value={period} max={currentMonth} disabled={busy || !!pending || sent} onChange={e => {setPeriod(e.target.value); setPreview(null); setConfirmed(false); setError('');}} /></label>
    <p className="hint">Der laufende Monat wird bis einschließlich heute ausgewertet. Beim Versand werden die Daten erneut aus der Datenbank gelesen.</p>
    {error && <div className="error banner" role="alert">{error}</div>}
    {notice && <div className="success banner" role="status">{notice}</div>}
    {!sent && <button type="button" disabled={!connectionOk || busy || !!pending || !period || period > currentMonth} onClick={() => request('preview')} style={{width:'100%'}}>Berichtsvorschau laden</button>}
    {busy && <p role="status">Bitte warten …</p>}
    {preview && <>
      <h3>{dateLabel(preview.period_start)} – {dateLabel(preview.period_end)}</h3>
      {preview.partial && <p className="hint">Laufender Monat – Teilbericht</p>}
      <div className="calculation">
        {[['Intern',preview.summary.internal_liters,'L'],['Extern',preview.summary.external_liters,'L'],['Gesamt',preview.summary.total_liters,'L'],['Externe Kosten',preview.summary.external_costs,'€']].map(([label,value,unit]) => <div key={label}><span>{label}</span><b>{formatLiters(value)} {unit}</b></div>)}
      </div>
      <p>Empfänger: {preview.recipient}</p>
      <p>Excel-Anhang: {preview.excel?.filename}</p>
      <details><summary>Vollständigen Bericht anzeigen</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',font:'inherit'}}>{preview.report_text}</pre></details>
      {!sent && !pending && <label style={{display:'flex',flexDirection:'row',gap:10,margin:'18px 0'}}><input type="checkbox" checked={confirmed} disabled={busy || !connectionOk} onChange={e => setConfirmed(e.target.checked)} style={{width:20,height:20,flexShrink:0}}/><span>Ich bestätige den E-Mail-Versand für diesen Berichtsmonat.</span></label>}
    </>}
    {!sent && (preview || pending) && <button type="button" disabled={!connectionOk || busy || (!pending && !confirmed)} onClick={() => request('send')} style={{width:'100%',marginTop:12}}>{pending ? 'Versandstatus erneut prüfen' : 'Monatsbericht per E-Mail versenden'}</button>}
    {pending && <p className="hint">Vorgangsnummer: {pending.request_id}. Bei unklarem Status bitte nicht die Seite neu laden oder einen neuen Versand starten.</p>}
  </section>;
}

// Geschützte Tankübersicht: wird beim Zurückkehren neu geladen.
function AdminTankOverview({ session, onSessionInvalid }) {
  const [tanks, setTanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setTanks([]);
    async function load() {
      try {
        const data = await adminRequest({
          action: 'get_tanks', session_token: session.token
        });
        if (cancelled) return;
        const items = [1, 2].map(id => data.tanks?.find(t => Number(t.id) === id));
        if (items.some(t => !t || t.stock == null || t.meter == null ||
          !Number.isFinite(Number(t.stock)) || !Number.isFinite(Number(t.meter)))) {
          throw new Error('Die Tankdaten sind unvollständig.');
        }
        setTanks(items);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) {
          onSessionInvalid();
          return;
        }
        setError(err.message || 'Tankdaten konnten nicht geladen werden.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [session.token, revision]);

  return <section style={{ marginBottom: 20 }}>
    <h3>Aktuelle Tankbestände</h3>
    {loading && <p role="status">Tankdaten werden geladen …</p>}
    {error && <div className="error banner" role="alert">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 12 }}>
      {tanks.map(tank => <div key={tank.id} style={{ border: '1px solid #dbe3ed', borderRadius: 12, padding: 16, background: '#e8f1fa', color: '#102b46' }}>
        <strong>{tank.name}</strong>
        <div style={{ fontSize: 26, fontWeight: 700, margin: '10px 0', color: Number(tank.stock) < 0 ? '#b91c1c' : undefined }}>
          {formatLiters(tank.stock)} L
        </div>
        <small>Pumpenzähler: {formatLiters(tank.meter)} L</small>
        {Number(tank.stock) < 0 && <p style={{ color: '#b91c1c' }}>Negativer rechnerischer Bestand</p>}
      </div>)}
    </div>
    <button type="button" disabled={loading} onClick={() => setRevision(v => v + 1)} style={{ width: '100%', marginTop: 12 }}>
      <RefreshCw size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} />
      Tankbestände aktualisieren
    </button>
  </section>;
}

export default function Admin() {
  const [password, setPassword] = useState('');
  const [session, setSession] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connectionOk, setConnectionOk] = useState(false);
  const [selectedTank, setSelectedTank] = useState(null);

  const loginBusy = useRef(false);
  const reportPendingRef = useRef(null);

  function invalidateSession() {
    setSession(null);
    setConnectionOk(false);
    setSelectedTank(null);
    setRemaining(0);
    setPassword('');
    setError('');

    setNotice(
      'Deine Admin-Sitzung ist ungültig oder abgelaufen. Bitte erneut anmelden.'
    );
  }

  // Countdown der Admin-Sitzung

  useEffect(() => {
    if (!session) return;

    function updateTimer() {
      const seconds = Math.max(
        0,
        Math.ceil(
          (
            new Date(session.expires_at).getTime() -
            Date.now()
          ) / 1000
        )
      );

      setRemaining(seconds);

      if (seconds === 0) {
        invalidateSession();
      }
    }

    updateTimer();

    const timer = setInterval(
      updateTimer,
      1000
    );

    return () => clearInterval(timer);

  }, [session]);

  // Serverseitige Sitzungsprüfung

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let checking = false;
    let connectionVersion = 0;

    async function checkSession() {
      if (cancelled || checking) return;

      if (!navigator.onLine) {
        setConnectionOk(false);
        return;
      }

      checking = true;

      const version = connectionVersion;

      try {
        const data = await adminRequest({
          action: 'check_session',
          session_token: session.token
        });

        if (cancelled) return;

        if (data.authenticated !== true) {
          invalidateSession();
          return;
        }

        if (
          version === connectionVersion &&
          navigator.onLine
        ) {
          setConnectionOk(true);
        }

      } catch (err) {
        if (cancelled) return;

        setConnectionOk(false);

        if (
          err.status === 401 ||
          err.status === 403
        ) {
          invalidateSession();
        }

      } finally {
        checking = false;
      }
    }

    function handleOffline() {
      connectionVersion++;

      if (!cancelled) {
        setConnectionOk(false);
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        connectionVersion++;

        setConnectionOk(false);
        checkSession();
      }
    }

    checkSession();

    const interval = setInterval(
      checkSession,
      15000
    );

    window.addEventListener(
      'offline',
      handleOffline
    );

    window.addEventListener(
      'online',
      checkSession
    );

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    );

    return () => {
      cancelled = true;

      clearInterval(interval);

      window.removeEventListener(
        'offline',
        handleOffline
      );

      window.removeEventListener(
        'online',
        checkSession
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );
    };

  }, [session]);

  // Anmeldung

  async function login(event) {
    event.preventDefault();

    if (loginBusy.current || !password) return;

    loginBusy.current = true;

    setLoading(true);
    setError('');
    setNotice('');
    setConnectionOk(false);
    setSelectedTank(null);

    try {
      const data = await adminRequest({
        action: 'login',
        password
      });

      if (
        data.authenticated !== true ||
        !data.session_token ||
        !Number.isFinite(
          new Date(data.expires_at).getTime()
        ) ||
        new Date(data.expires_at).getTime() <= Date.now()
      ) {
        throw new Error(
          'Die Admin-Sitzung konnte nicht erstellt werden.'
        );
      }

      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (
              new Date(data.expires_at).getTime() -
              Date.now()
            ) / 1000
          )
        )
      );

      setSession({
        token: data.session_token,
        expires_at: data.expires_at
      });

    } catch (err) {
      setError(
        err.name === 'TimeoutError'
          ? 'Keine Verbindung zum Server. Bitte erneut versuchen.'
          : err.message
      );

    } finally {
      loginBusy.current = false;

      setPassword('');
      setLoading(false);
    }
  }

  // Abmeldung

  async function logout() {
    if (!session || loading) return;

    const token = session.token;

    setLoading(true);
    setError('');
    setNotice('');
    setConnectionOk(false);
    setSession(null);
    setSelectedTank(null);
    setPassword('');
    setRemaining(0);

    try {
      await adminRequest({
        action: 'logout',
        session_token: token
      });

      setNotice(
        'Du wurdest erfolgreich abgemeldet.'
      );

    } catch {
      setNotice(
        'Lokal abgemeldet. Die serverseitige Abmeldung konnte nicht bestätigt werden. Die Sitzung läuft spätestens nach 30 Minuten ab.'
      );

    } finally {
      setLoading(false);
    }
  }

  const minutes = String(
    Math.floor(remaining / 60)
  ).padStart(2, '0');

  const seconds = String(
    remaining % 60
  ).padStart(2, '0');

  return (
    <div className="panel formpanel">

      <h2>
        <Shield
          size={23}
          style={{
            verticalAlign: 'middle',
            marginRight: '8px'
          }}
        />
        Admin-Bereich
      </h2>

      {error && (
        <div
          className="error banner"
          role="alert"
        >
          {error}
        </div>
      )}

      {notice && (
        <p className="hint" role="status">
          {notice}
        </p>
      )}

      {!session ? (
        <>

          <p className="sub">
            Geschützter Verwaltungsbereich des
            VfM Klausheide
          </p>

          <form onSubmit={login}>

            <label>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Lock size={18} />
                Admin-Passwort
              </span>

              <input
                type="password"
                autoComplete="current-password"
                placeholder="Passwort eingeben"
                value={password}
                onChange={event =>
                  setPassword(event.target.value)
                }
                maxLength={512}
                disabled={loading}
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading || !password}
              style={{ width: '100%' }}
            >
              {loading
                ? 'Bitte warten …'
                : 'Anmelden'}
            </button>

            <p className="hint">
              Dieser Bereich ist ausschließlich
              für berechtigte Administratoren.
            </p>

          </form>

        </>
      ) : (
        <>

          {connectionOk ? (
            <div className="success banner">
              Du bist als Administrator angemeldet.
            </div>
          ) : (
            <div
              className="error banner"
              role="status"
            >
              Die Admin-Sitzung wird überprüft
              oder die Serververbindung ist
              unterbrochen. Die Verwaltungsfunktionen
              sind vorsorglich gesperrt.
            </div>
          )}

          <div
            className="calculation"
            style={{ marginBottom: '20px' }}
          >
            <div>
              <span>
                <Clock
                  size={18}
                  style={{
                    verticalAlign: 'middle',
                    marginRight: '6px'
                  }}
                />
                Verbleibende Sitzungsdauer
              </span>

              <b>{minutes}:{seconds}</b>
            </div>
          </div>

          {selectedTank === null ? (
            <>

              {connectionOk && <AdminTankOverview
                session={session}
                onSessionInvalid={invalidateSession}
              />}

              <h3>Tankverwaltung</h3>

              <button
                type="button"
                onClick={() => setSelectedTank(1)}
                disabled={!connectionOk}
                style={{
                  width: '100%',
                  marginBottom: '10px'
                }}
              >
                Doppelachser verwalten
              </button>

              <button
                type="button"
                onClick={() => setSelectedTank(2)}
                disabled={!connectionOk}
                style={{
                  width: '100%',
                  marginBottom: '20px'
                }}
              >
                Einachser verwalten
              </button>

              <h3>Monatsberichte</h3>

              <button
                type="button"
                onClick={() => setSelectedTank("report")}
                disabled={!connectionOk}
                style={{
                  width: '100%',
                  marginBottom: '15px'
                }}
              >
                Monatsbericht versenden
              </button>

              <p className="hint">
                Monatsbericht auswählen, prüfen und per E-Mail versenden.
              </p>

            </>
          ) : (
            <div hidden={!connectionOk}>

              {selectedTank === "report" ? <ReportManagement
                session={session}
                connectionOk={connectionOk}
                pendingRef={reportPendingRef}
                onBack={() => setSelectedTank(null)}
                onSessionInvalid={invalidateSession}
              /> : <TankManagement
                key={`${session.token}-${selectedTank}`}
                tankId={selectedTank}
                session={session}
                connectionOk={connectionOk}
                onBack={() => setSelectedTank(null)}
                onSessionInvalid={invalidateSession}
              />}

            </div>
          )}

          <hr
            style={{
              border: 0,
              borderTop: '1px solid #dbe3ed',
              margin: '24px 0'
            }}
          />

          <button
            type="button"
            onClick={logout}
            disabled={loading}
            style={{
              width: '100%',
              background: '#a52a2a',
              color: '#ffffff'
            }}
          >
            <LogOut
              size={18}
              style={{
                verticalAlign: 'middle',
                marginRight: '8px'
              }}
            />

            {loading
              ? 'Abmeldung läuft …'
              : 'Abmelden'}
          </button>

        </>
      )}

    </div>
  );
}
