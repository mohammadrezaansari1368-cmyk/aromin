import { createApplication } from './backend/app.mjs';
const app = await createApplication({ port:Number(process.env.XSI_PORT||8082),dataDir:process.env.XSI_DATA_DIR });
console.log(`XSI independent application: ${app.origin}`);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await app.close();process.exit(0);});
