// Verbindingsinstellingen voor de netwerktest.
// Hier later makkelijk een TURN-server toevoegen (nodig als STUN alleen niet lukt).
window.NET_CONFIG = {
  // Versie van de test. Bij elke nieuwe stap ophogen (en ook ?v= in index.html).
  // Hebben host en gast een andere versie, dan waarschuwt de lobby.
  versie: 4,

  // Standaard gratis PeerJS-server (leeg laten = PeerJS kiest zelf 0.peerjs.com)
  peer: {
    // host: '0.peerjs.com', port: 443, secure: true, path: '/',
    debug: 1,
  },

  // Voorvoegsel voor de PeerJS-id: "morvath-" + kamercode
  idPrefix: 'morvath-',

  // ICE-servers: STUN zoekt je publieke adres, TURN stuurt verkeer door als het niet direct kan
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // { urls: 'turn:jouw-turn-server:3478', username: '...', credential: '...' },
  ],

  // Wachttijden in milliseconden
  tijden: {
    verbinden: 10000,    // zo lang mag verbinden duren
    stilte: 4000,        // zo lang niets gehoord = de ander is even weg
    wachtOpGast: 30000,  // zo lang wacht de host op een gast die even weg is
  },
};
