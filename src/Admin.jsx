
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
      cache: 'no-store'
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.error || 'Die Anfrage ist fehlgeschlagen.'
    );
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
        setNotice(
          'Deine Admin-Sitzung ist abgelaufen. Bitte erneut anmelden.'
        );
      }
    }

    updateTimer();

    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [session]);

  async function login(event) {
    event.preventDefault();

    if (loading || !password) return;

    setLoading(true);
    setError('');
    setNotice('');

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
      setError(err.message);

    } finally {
      setPassword('');
      setLoading(false);
    }
  }

  async function logout() {
    if (!session || loading) return;

    setLoading(true);
    setError('');

    try {
      await adminRequest({
        action: 'logout',
        session_token: session.token
      });

      setNotice('Du wurdest erfolgreich abgemeldet.');

    } catch {
      setNotice(
        'Lokal abgemeldet. Die serverseitige Abmeldung konnte nicht bestätigt werden. Die Sitzung läuft spätestens nach 30 Minuten ab.'
      );

    } finally {
      setSession(null);
      setPassword('');
      setRemaining(0);
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
              <Lock
                size={18}
                style={{
                  verticalAlign: 'middle',
                  marginRight: '6px'
                }}
              />

              Admin-Passwort

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
                ? 'Anmeldung wird geprüft …'
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
          <div className="success banner">
            Du bist als Administrator angemeldet.
          </div>

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
