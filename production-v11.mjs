import { runNotificationProfileIsolationAudit } from './notification-profile-isolation-audit-v1.mjs';

await import('./production-v10.mjs');
setTimeout(()=>{runNotificationProfileIsolationAudit().catch(()=>{});},1500).unref?.();
console.log('notification profile isolation audit scheduled');
