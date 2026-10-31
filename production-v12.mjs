import { repairNotificationProfileIsolation } from './notification-profile-isolation-repair-v1.mjs';

await import('./production-v11.mjs');
setTimeout(()=>{repairNotificationProfileIsolation().catch(()=>{});},2500).unref?.();
console.log('notification profile isolation repair scheduled');
