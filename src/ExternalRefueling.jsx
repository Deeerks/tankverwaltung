
import React, { useRef, useState } from 'react';
import { Fuel, Camera, Plane } from 'lucide-react';
import './style.css';

const AIRCRAFT = [
  'D-ELCH',
  'D-ELLH',
  'D-EVFM',
  'PH-BAJ'
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function todayGermany() {
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const get = type =>
    parts.find(p => p.type === type).value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseDecimal(value) {
  const text = String(value).trim();

  if (!/^\d+(?:,\d{1,2})?$/.test(text)) {
    return NaN;
  }

  return Number(text.replace(',', '.'));
}

function formatDecimal(value) {
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function preparePhoto(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 20 * 1024 * 1024) {
      reject(new Error('Das Originalfoto ist zu groß.'));
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      try {
        const maxSize = 2000;
        const scale = Math.min(
          1,
          maxSize / Math.max(image.width, image.height)
        );

        const canvas = document.createElement('canvas');

        canvas.width = Math.max(
          1,
          Math.round(image.width * scale)
        );

        canvas.height = Math.max(
          1,
          Math.round(image.height * scale)
        );

        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(
          image,
          0,
          0,
          canvas.width,
          canvas.height
        );

        const dataUrl = canvas.toDataURL(
          'image/jpeg',
          0.85
        );

        const base64 = dataUrl.split(',')[1];

        if (!base64 || base64.length > 6990504) {
          throw new Error(
            'Das Rechnungsfoto ist zu groß.'
          );
        }

        resolve({ base64, preview: dataUrl });

      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      reject(new Error(
        'Das Foto konnte nicht gelesen werden. Bitte JPG oder PNG verwenden.'
      ));
    };

    image.src = objectUrl;
  });
}

export default function ExternalRefueling() {
  const params = new URLSearchParams(
    window.location.search
  );

  const token = params.get('token') || '';

  const [operator, setOperator] = useState('');
  const [aircraft, setAircraft] = useState('');
  const [fuelDate, setFuelDate] = useState(todayGermany);
  const [location, setLocation] = useState('');
  const [liters, setLiters] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [locked, setLocked] = useState(false);

  const request = useRef(null);
  const submitting = useRef(false);
  const fileInput = useRef(null);

  const amount = parseDecimal(liters);
  const unitPrice = parseDecimal(pricePerLiter);
  const total = parseDecimal(totalPrice);

  const validUnitPrice =
    /^\d+,\d{2}$/.test(pricePerLiter.trim());

  const validTotalPrice =
    /^\d+,\d{2}$/.test(totalPrice.trim());

  const calculatedTotal = amount * unitPrice;

  const priceMismatch =
    Number.isFinite(calculatedTotal) &&
    Number.isFinite(total) &&
    Math.abs(calculatedTotal - total) > 0.03;

  const valid =
    operator.trim().length > 0 &&
    AIRCRAFT.includes(aircraft) &&
    fuelDate &&
    fuelDate <= todayGermany() &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 2000 &&
    validUnitPrice &&
    unitPrice > 0 &&
    unitPrice <= 20 &&
    validTotalPrice &&
    total > 0 &&
    total <= 40000 &&
    !priceMismatch &&
    !photoError &&
    confirmed;

  async function selectPhoto(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setPhotoLoading(true);
    setReceipt(null);
    setPhotoError('');
    setError('');

    try {
      const photo = await preparePhoto(file);
      setReceipt(photo);

    } catch (err) {
      setPhotoError(err.message);

    } finally {
      setPhotoLoading(false);
    }
  }

  function removePhoto() {
    setReceipt(null);
    setPhotoError('');

    if (fileInput.current) {
      fileInput.current.value = '';
    }
  }

  async function saveRefueling(event) {
    event.preventDefault();

    if (
      submitting.current ||
      loading ||
      photoLoading ||
      !valid
    ) {
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError('');

    try {
      if (!request.current) {
        request.current = {
          token,
          booking_id: crypto.randomUUID(),
          aircraft,
          operator: operator.trim(),
          fuel_date: fuelDate,
          location: location.trim(),
          liters: amount,
          price_per_liter: unitPrice,
          total_price: total,
          ...(receipt
            ? {
                receipt: {
                  base64: receipt.base64
                }
              }
            : {})
        };
      }

      setLocked(true);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/external-refueling`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY
          },
          body: JSON.stringify(request.current)
        }
      );

      const data = await response.json();

      if (
        response.ok &&
        data.success === true &&
        data.email_status === 'sent'
      ) {
        setSuccess(true);
        request.current = null;
        setReceipt(null);

        return;
      }

      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 413
      ) {
        if (!data.booking_saved) {
          request.current = null;
          setLocked(false);
        }
      }

      setError(
        data.error ||
        data.message ||
        'Die Betankung konnte noch nicht vollständig verarbeitet werden.'
      );

    } catch (err) {
      setError(
        'Verbindung unterbrochen. Bitte denselben Vorgang erneut senden, damit keine doppelte Buchung entsteht.'
      );

    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  function newRefueling() {
    setOperator('');
    setAircraft('');
    setFuelDate(todayGermany());
    setLocation('');
    setLiters('');
    setPricePerLiter('');
    setTotalPrice('');
    setReceipt(null);
    setPhotoError('');
    setConfirmed(false);
    setError('');
    setSuccess(false);
    setLocked(false);
    request.current = null;
  }

  if (!token) {
    return (
      <main className="shell">
        <div className="panel">
          <h1>Tankverwaltung VfM Klausheide</h1>

          <p>
            Bitte scanne den QR-Code im Flugzeug,
            um eine externe Betankung zu erfassen.
          </p>
        </div>
      </main>
    );
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <main className="shell">
        <div className="panel">
          <h2>Konfigurationsfehler</h2>
          <p>Die Datenbankverbindung fehlt.</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <header>
        <div className="shell head">
          <div>
            <div className="brand">
              <Fuel /> Tankverwaltung
            </div>

            <span>
              VfM Klausheide · Kraftstoffmanagement
            </span>
          </div>
        </div>
      </header>

      <main className="shell">

        <nav>
          <button className="active" type="button">
            <Plane size={19} />
            <span>Externe Betankung</span>
          </button>
        </nav>

        {success ? (
          <div className="panel">
            <h2>Betankung erfolgreich gespeichert</h2>

            <div className="success banner">
              Deine externe Betankung wurde gespeichert.
              Die E-Mail wurde vom Versanddienst angenommen.
            </div>

            <div className="calculation">
              <div>
                <span>Flugzeug</span>
                <b>{aircraft}</b>
              </div>

              <div>
                <span>Getankte Menge</span>
                <b>{formatDecimal(amount)} L</b>
              </div>

              <div>
                <span>Gesamtpreis</span>
                <b>{formatDecimal(total)} €</b>
              </div>
            </div>

            <button onClick={newRefueling}>
              Weitere Betankung erfassen
            </button>
          </div>
        ) : (
          <div className="panel formpanel">
            <h2>Externe Betankung</h2>

            <p className="sub">
              Betankung außerhalb unserer Vereinstanks
            </p>

            {error && (
              <div className="error banner" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={saveRefueling}>

              <label>
                Name des Piloten *

                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Vor- und Nachname"
                  maxLength={120}
                  value={operator}
                  onChange={e =>
                    setOperator(e.target.value)
                  }
                  disabled={locked || loading}
                  required
                />
              </label>

              <label>
                Flugzeug-Rufzeichen *

                <select
                  value={aircraft}
                  onChange={e =>
                    setAircraft(e.target.value)
                  }
                  disabled={locked || loading}
                  required
                >
                  <option value="">
                    Flugzeug auswählen
                  </option>

                  {AIRCRAFT.map(plane => (
                    <option key={plane} value={plane}>
                      {plane}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Betankungsdatum *

                <input
                  type="date"
                  value={fuelDate}
                  max={todayGermany()}
                  onChange={e =>
                    setFuelDate(e.target.value)
                  }
                  disabled={locked || loading}
                  required
                />
              </label>

              <label>
                Flugplatz / Tankstelle

                <input
                  type="text"
                  placeholder="z. B. Paderborn"
                  maxLength={200}
                  value={location}
                  onChange={e =>
                    setLocation(e.target.value)
                  }
                  disabled={locked || loading}
                />
              </label>

              <label>
                Getankte Menge (Liter) *

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="z. B. 50,00"
                  value={liters}
                  onChange={e =>
                    setLiters(e.target.value)
                  }
                  disabled={locked || loading}
                  required
                />
              </label>

              <label>
                Preis pro Liter (€) *

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="z. B. 2,35"
                  pattern="[0-9]+,[0-9]{2}"
                  title="Bitte mit Komma und zwei Nachkommastellen eingeben."
                  value={pricePerLiter}
                  onChange={e =>
                    setPricePerLiter(e.target.value)
                  }
                  disabled={locked || loading}
                  required
                />
              </label>

              <label>
                Gesamtpreis (€) *

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="z. B. 117,50"
                  pattern="[0-9]+,[0-9]{2}"
                  value={totalPrice}
                  onChange={e =>
                    setTotalPrice(e.target.value)
                  }
                  disabled={locked || loading}
                  required
                />
              </label>

              {priceMismatch && (
                <div className="error banner">
                  Der Gesamtpreis stimmt nicht mit
                  der Menge und dem Literpreis überein.

                  Rechnerischer Gesamtpreis:
                  {' '}
                  {formatDecimal(calculatedTotal)} €
                </div>
              )}

              <label>
                <Camera size={19} />
                {' '}Rechnungsfoto (optional)

                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  onChange={selectPhoto}
                  disabled={
                    locked ||
                    loading ||
                    photoLoading
                  }
                />
              </label>

              {photoLoading && (
                <p>Rechnungsfoto wird vorbereitet …</p>
              )}

              {photoError && (
                <div className="error banner">
                  {photoError}

                  <button
                    type="button"
                    onClick={removePhoto}
                  >
                    Foto entfernen
                  </button>
                </div>
              )}

              {receipt && (
                <div>
                  <img
                    src={receipt.preview}
                    alt="Vorschau der Rechnung"
                    style={{
                      width: '100%',
                      maxHeight: '320px',
                      objectFit: 'contain',
                      borderRadius: '8px'
                    }}
                  />

                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={locked || loading}
                  >
                    Foto entfernen
                  </button>
                </div>
              )}

              <div
                style={{
                  background: '#fff4d6',
                  color: '#664600',
                  padding: '15px',
                  borderRadius: '8px',
                  border: '1px solid #e5bd55',
                  lineHeight: '1.5'
                }}
              >
                <strong>Wichtiger Hinweis</strong>

                <p>
                  Eine Erstattung der Kosten ist nur
                  mit einer korrekt eingescannten oder
                  beim Vorstand abgegebenen Rechnung
                  möglich.
                </p>
              </div>

              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e =>
                    setConfirmed(e.target.checked)
                  }
                  disabled={locked || loading}
                  required
                />

                Ich bestätige, dass alle Angaben
                korrekt sind.
              </label>

              {locked && !loading && (
                <p className="hint">
                  Bitte denselben Vorgang erneut senden.
                  Die Buchungskennung bleibt erhalten,
                  damit keine doppelte Betankung entsteht.
                </p>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  photoLoading ||
                  !valid
                }
              >
                {loading
                  ? 'Betankung wird gespeichert …'
                  : locked
                  ? 'Erneut senden'
                  : 'Betankung speichern'}
              </button>

              <p className="hint">
                * Pflichtfelder
              </p>

            </form>
          </div>
        )}
      </main>
    </>
  );
}
