
import React, { useEffect, useState } from 'react';
import { Shield, Lock, LogOut, Clock } from 'lucide-react';
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

export default function Admin() {
  const [password, setPassword] = useState('');
  const [session, setSession] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connectionOk, setConnectionOk] = useState(false);

  // Countdown der Admin-Sitzung
  useEffect(() => {
    if (!session) return;

    function updateTimer() {
      const seconds = Math.max(
        0,
        Math.ceil(
          (new Date(session.expires_at).getTime() -
            Date.now()) / 1000
        )
      );

      setRemaining(seconds);

      if (seconds === 0) {
        setSession(null);
        setConnectionOk(false);
        setNotice(
          'Deine Admin-Sitzung ist abgelaufen. Bitte erneut anmelden.'
        );
      }
    }

    updateTimer();

    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [session]);

  // Serverseitige Sitzungsprüfung
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let checking = false;

    async function checkSession() {
      if (cancelled || checking) return;

      checking = true;

      try {
        const data = await adminRequest({
          action: 'check_session',
          session_token: session.token
        });

        if (cancelled) return;

        if (data.authenticated !== true) {
          setSession(null);
          setConnectionOk(false);
          setRemaining(0);
          setNotice(
            'Deine Admin-Sitzung ist ungültig oder abgelaufen. Bitte erneut anmelden.'
          );

          return;
        }

        setConnectionOk(true);

      } catch (err) {
        if (cancelled) return;

        setConnectionOk(false);

        if (
          err.status === 401 ||
          err.status === 403
        ) {
          setSession(null);
          setRemaining(0);
          setError('');
          setNotice(
            'Deine Admin-Sitzung ist ungültig oder abgelaufen. Bitte erneut anmelden.'
          );
        }

      } finally {
        checking = false;
      }
    }

    function handleOffline() {
      if (!cancelled) {
        setConnectionOk(false);
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
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

    if (loading || !password) return;

    setLoading(true);
    setError('');
    setNotice('');
    setConnectionOk(false);

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
            (new Date(data.expires_at).getTime() -
              Date.now()) / 1000
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
        <div className="error banner" role="alert">
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

          {connectionOk && (
            <>
              <h3>Tankverwaltung</h3>

              <button
                type="button"
                disabled
                style={{
                  width: '100%',
                  marginBottom: '10px'
                }}
              >
                Doppelachser verwalten
              </button>

              <button
                type="button"
                disabled
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
                disabled
                style={{
                  width: '100%',
                  marginBottom: '15px'
                }}
              >
                Monatsbericht versenden
              </button>

              <p className="hint">
                Die Verwaltungsfunktionen werden
                in den nächsten Entwicklungsschritten
                freigeschaltet.
              </p>
            </>
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
