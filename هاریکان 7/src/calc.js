// پل بین پنل و موتور مشترک (shared/core.js)
import * as core from '../shared/core.js';
import { db, today } from './store.js';

export const { J, fmt, weekday, hm, daysBetween } = core;
const data = () => ({
  personnel: db.list('personnel'), shifts: db.list('shifts'), holidays: db.list('holidays'),
  attendance: db.list('attendance'), requests: db.list('requests'), policies: db.list('policies'),
});
export const dayRow = (person, date) => core.dayRow(data(), person, date);
export const performance = (person, from, to) => core.performance(data(), person, from, to, { today: today() });
export const leaveUsage = (person, year, month) => core.leaveUsage(data(), person, year, month);
export const validateRequest = (req) => core.validateRequest(data(), req, { today: today() });
export const dashboard = (date) => core.dashboard(data(), date);
