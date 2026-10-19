// پل سرور به موتور مشترک (shared/core.js)
export * from '../../../shared/core.js';
import { engineData } from '../db.js';

// برای محاسبه شیفت یک نفر لازم نیست همه ترددها بارگذاری شوند
export const engineDataFor = () => ({ ...engineData(), attendance: [] });
