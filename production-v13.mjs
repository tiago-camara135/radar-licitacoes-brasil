import { repairNotificationProfileIsolationV2 } from './notification-profile-isolation-repair-v2.mjs';

await import('./production-v12.mjs');
setTimeout(()=>{repairNotificationProfileIsolationV2().catch(()=>{});},3500).unref?.();
console.log('notification profile isolation repair v2 scheduled');
