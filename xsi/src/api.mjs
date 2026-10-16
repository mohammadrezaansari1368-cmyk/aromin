let csrf = '';
export class RequestError extends Error { constructor(error,status) { super(error.message); this.code=error.code; this.fields=error.fields||{};this.status=status; } }
export async function request(route, options={}) {
  const response=await fetch('/api'+route,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{}),...options.headers}});
  const data=await response.json();
  if(!response.ok) throw new RequestError(data.error||{message:'خطای پاسخ سرور'},response.status);
  if(data.csrf) csrf=data.csrf;
  return data;
}
export async function requireSession() {
  try { return await request('/session'); }
  catch(error) { if(error.status===401) location.replace('/login.html'); throw error; }
}
