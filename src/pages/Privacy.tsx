import { LegalLayout } from '@/components/layout/LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <p>
        PushupArena verarbeitet personenbezogene Daten nach dem Grundsatz der Datenminimierung.
        Diese Erklärung ist ein Platzhalter und muss an deinen konkreten Einsatz angepasst werden.
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>[Name / Firma], [Anschrift], [E-Mail]. Siehe Impressum.</p>

      <h2>2. Welche Daten wir verarbeiten</h2>
      <p>
        Konto: E-Mail-Adresse (nur für Login/Kommunikation, nie öffentlich sichtbar). Profil:
        Username, optionaler Anzeigename, Avatar und Bio. Nutzungsdaten: deine Trainings-Einträge,
        Ziele und Freundschaften.
      </p>

      <h2>3. Zweck & Rechtsgrundlage</h2>
      <p>
        Die Verarbeitung erfolgt zur Bereitstellung der App-Funktionen (Art. 6 Abs. 1 lit. b DSGVO)
        sowie auf Basis deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), z. B. für die Auffindbarkeit
        per Username.
      </p>

      <h2>4. Sichtbarkeit & Freunde</h2>
      <p>
        Deine privaten Trainingsdaten sind nur für dich sichtbar. Aggregierte Vergleichswerte
        (heutige/gesamte Wiederholungen, Level, Streak) sind ausschließlich für von dir bestätigte
        Freunde sichtbar. Es gibt keine öffentliche, globale Rangliste. E-Mail-Adressen werden
        niemals gegenüber anderen Nutzern angezeigt.
      </p>

      <h2>5. Auftragsverarbeitung (Supabase)</h2>
      <p>
        Hosting von Authentifizierung und Datenbank erfolgt über Supabase. Bitte schließe einen
        Auftragsverarbeitungsvertrag ab und ergänze hier die Details.
      </p>

      <h2>6. Speicherdauer & Löschung</h2>
      <p>
        Du kannst dein Konto jederzeit in den Einstellungen löschen. Dabei werden alle deine
        Einträge, Ziele, Freundschaften und Profildaten unwiderruflich entfernt.
      </p>

      <h2>7. Deine Rechte</h2>
      <p>
        Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch.
        Wende dich dazu an den oben genannten Verantwortlichen.
      </p>

      <h2>8. Cookies / Tracking</h2>
      <p>
        Es werden keine Tracking- oder Marketing-Cookies eingesetzt. Für die Sitzung wird lediglich
        technisch notwendiger lokaler Speicher (Auth-Token) verwendet.
      </p>
    </LegalLayout>
  );
}
