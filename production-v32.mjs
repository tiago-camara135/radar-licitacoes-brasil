import { installAlertBackfillHook,initAlertBackfill } from './alert-backfill-v1.mjs';

installAlertBackfillHook();
await import('./production-v31.mjs');
await initAlertBackfill();
console.log('alert backfill runtime v1 active: current open opportunities reconciled on alert create/update');
