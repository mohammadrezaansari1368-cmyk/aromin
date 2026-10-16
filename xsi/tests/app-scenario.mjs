import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const baseline=JSON.parse(readFileSync(new URL('./browser-scenario.json',import.meta.url),'utf8'));
export function buildAppScenario({origin='http://127.0.0.1:8083',width=1280,username='browser-owner',credential={source:'secret',secret_id:'xsi_test_password'}}={}){
  const wait=step_id=>({step_id,action:'wait_for',locator:{kind:'css',selector:"#customer-table[aria-busy='false']"},state:'visible',timeout_ms:7000});
  const actions=[{step_id:'login-ready',action:'wait_for',locator:{kind:'css',selector:'#auth-submit:not([disabled])'},state:'visible',timeout_ms:7000},
    {step_id:'login-name',action:'fill',locator:{kind:'css',selector:'#username'},value:{source:'literal',value:username}},
    {step_id:'login-pass',action:'fill',locator:{kind:'css',selector:'#password'},value:credential},
    {step_id:'login',action:'click',locator:{kind:'css',selector:'#auth-submit'}},wait('persisted-live'),
    {step_id:'demo-mode',action:'select_option',locator:{kind:'css',selector:'#dataset'},value:{source:'literal',value:'demo'}},wait('demo-ready')];
  for(const action of baseline.actions.filter(a=>a.step_id!=='open-branch')){
    actions.push(action);
    if(action.action==='check'||(action.action==='click'&&!['menu-open','menu-escape'].includes(action.step_id)))actions.push(wait(action.step_id+'-loaded'));
  }
  return {browser:{mode:'launch',executable_path:process.env.XSI_BROWSER_EXECUTABLE||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true},environment:{viewport:{width,height:width<700?844:800}},start_url:{url:origin+'/branch.html'},actions,
    secrets:credential.source==='secret'?[{secret_id:credential.secret_id,environment_variable:'XSI_BROWSER_TEST_PASSWORD'}]:[],
    capture:{after_each_step:['accessibility','url'],events:['page-errors','network','downloads'],network:{header_values:false,request_body:false,response_body:false}}};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildAppScenario({width:Number(process.argv[2]||1280)}),null,2));
