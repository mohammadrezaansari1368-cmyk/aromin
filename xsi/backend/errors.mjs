export class ApiError extends Error {
  constructor(status, code, message, fields = {}) { super(message); Object.assign(this, { status, code, fields }); }
}
export function exactObject(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(k => !keys.includes(k))) throw new ApiError(400, 'invalid_body', 'ساختار درخواست معتبر نیست.');
}
