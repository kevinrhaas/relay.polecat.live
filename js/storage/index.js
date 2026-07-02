// -----------------------------------------------------------------------
// storage/ — pluggable snapshot-sync adapters ("sync locations").
//
// Each adapter reads/writes ONE JSON snapshot in the existing export shape
// (Store.export()), merging on load via last-writer-wins (Store.import
// with {merge:true}) and writing on change (debounced) — exactly like
// sync.js does for peers, just against a passive location instead of a
// live connection. That means any number of adapters, and any number of
// peers, all converge to the same state.
//
// Adapter contract (see local-folder.js for the reference implementation):
//   id, label            — identity for the UI
//   isSupported()         — capability check for this browser
//   state                 — 'off' | 'needs-permission' | 'connected' |
//                            'error' | 'unsupported'
//   connect()             — prompt the user, start syncing; returns boolean
//   reconnect()            — re-grant access after a reload (user gesture)
//   disconnect()           — stop syncing, forget the location
//   autostart()             — silently resume at boot if still permitted
//   on(event, fn)           — 'state' | 'synced'
//
// Today: local folder (File System Access API), no credentials. Planned
// next (see ROADMAP.md): S3-compatible, WebDAV, Dropbox/Drive.
// -----------------------------------------------------------------------
import { LocalFolder } from './local-folder.js';

export const ADAPTERS = [LocalFolder];
export { LocalFolder };
