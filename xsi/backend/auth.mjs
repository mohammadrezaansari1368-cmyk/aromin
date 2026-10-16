import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { ApiError, exactObject } from './errors.mjs';
export const sessionDigest = value => createHash('sha256').update(value).digest('hex');
export function validateCredentials(body) {
  exactObject(body, ['username', 'password']);
  if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,64}$/.test(body.username) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw new ApiError(422, 'credentials_invalid', 'نام کاربری ۳ تا ۶۴ حرف لاتین و رمز ۱۲ تا ۱۲۸ نویسه لازم است.');
}
export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}
export function createUser(db, username, password) {
  return db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?) RETURNING id,username').get(username, passwordHash(password));
}
export function newSession(db, user) {
  const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(digest,user_id,csrf,expires) VALUES(?,?,?,?)').run(sessionDigest(token), user.id, csrf, Date.now() + 8 * 60 * 60 * 1000);
  return { token, user: { id: user.id, username: user.username }, csrf };
}
export function authenticate(db, cookie) {
  const token = cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('xsi_session='))?.slice(12);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'sign_in_required', 'ابتدا وارد حساب محلی شوید.');
  const session = db.prepare('SELECT s.digest,s.csrf,s.expires,u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE digest=?').get(sessionDigest(token));
  if (!session || session.expires <= Date.now()) throw new ApiError(401, 'sign_in_required', 'نشست پایان یافته است.');
  return session;
}
export function login(db, body) {
  validateCredentials(body);
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(body.username);
  const candidate = user?.password_hash || passwordHash('invalid-placeholder-password', '00000000000000000000000000000000');
  if (!verifyPassword(body.password, candidate) || !user) throw new ApiError(401, 'invalid_login', 'نام کاربری یا رمز نادرست است.');
  return newSession(db, user);
}
