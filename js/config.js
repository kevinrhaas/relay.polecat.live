// -----------------------------------------------------------------------
// Site defaults (optional).
//
// Leave these blank and Relay stays fully serverless: peers use local mesh +
// the manual WebRTC invite, and anyone can still turn on auto-discovery in
// Settings → Advanced.
//
// If you deploy the rendezvous Worker (see /rendezvous) and want EVERYONE to
// auto-connect with zero per-user setup, put your relay URL here and redeploy
// the app once. From then on the app auto-joins the room on load.
// -----------------------------------------------------------------------
export const DEFAULT_RENDEZVOUS = {
  url:  'wss://relay-rendezvous.kevinrhaas.workers.dev',  // deployed relay (blank = off)
  room: 'polecat',                                        // shared room everyone joins by default
};
