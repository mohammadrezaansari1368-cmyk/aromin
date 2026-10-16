// ساخت یا تغییر رمز مدیر:  npm run create-admin -- <username> <password> [name]
import 'dotenv/config';
import { createAdmin } from '../auth.js';
const [username, password, ...name] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('استفاده: npm run create-admin -- <نام‌کاربری> <رمز حداقل ۸ کاراکتر> [نام]');
  process.exit(1);
}
createAdmin(username, password, name.join(' ') || undefined);
console.log(`✓ مدیر «${username}» ذخیره شد`);
