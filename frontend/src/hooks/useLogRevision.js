import { useSyncExternalStore } from 'react';
let revision = 0;
const listeners = new Set();
const notify = () => { revision++; listeners.forEach(fn => fn()); };
window.addEventListener('cinelog:logs-changed', notify);
window.addEventListener('storage', notify);
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export default function useLogRevision() { return useSyncExternalStore(subscribe, () => revision); }
