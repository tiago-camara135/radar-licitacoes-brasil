import { repairNotificationProfileIsolationV2 } from './notification-profile-isolation-repair-v2.mjs';

await import('./production-v11.mjs');
setTimeout(()=>{repairNotificationProfileIsolationV2().catch(()=>{});},2500).unref?.();
console.log('notification profile isolation repair v2 scheduled');
