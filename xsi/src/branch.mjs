import { branchColumns, pageSizes, branchFilters, unavailableActions, branchMenu } from './branch-model.mjs';
import { initialBranchState, transition } from './branch-state.mjs';
import { request, requireSession } from './api.mjs';
let state=initialBranchState(),dataset='live',sequence=0,openMenu=null,saving=false;
const $=selector=>document.querySelector(selector);
const wide=matchMedia('(min-width:851px)');$('#branch-navigation').open=wide.matches;wide.addEventListener('change',()=>{$('#branch-navigation').open=wide.matches;});
function disabledButton(text) { const button=document.createElement('button');button.textContent=text;button.disabled=true;button.title='پیاده‌سازی نشده؛ رفتار تأیید نشده است';return button; }
function closeMenu(){if(openMenu){openMenu.content.hidden=true;openMenu.button.setAttribute('aria-expanded','false');openMenu=null;}}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&openMenu){const button=openMenu.button;closeMenu();button.focus();}});
document.addEventListener('click',event=>{if(openMenu&&!openMenu.wrapper.contains(event.target))closeMenu();});
function dispatch(event){closeMenu();state=transition(state,event);void loadResults();}
$('#branch-menu').replaceChildren(...branchMenu.map(text=>{if(text!=='لیست مشتریان')return disabledButton(text);const current=document.createElement('span');current.textContent=text;current.setAttribute('aria-current','page');return current;}));
$('#primary-actions').append(...unavailableActions.slice(1,3).map(disabledButton));
$('#row-actions').replaceChildren(...unavailableActions.slice(3).map(disabledButton));
$('#search').addEventListener('input',event=>{state=transition(state,{type:'draft',value:event.target.value});});
$('#apply-search').onclick=()=>dispatch({type:'search'});
$('#retry').onclick=()=>void loadResults();
$('#dataset').onchange=event=>{dataset=event.target.value;state=initialBranchState();$('#search').value='';document.querySelectorAll('#branch-filters input').forEach(input=>{input.checked=Number(input.value)===state.filters[input.name];});void loadResults();};
$('#logout').onclick=async()=>{try{await request('/auth/logout',{method:'POST'});location.assign('/login.html');}catch(error){$('#request-error').textContent=error.message;}};
$('#page-sizes').append(...pageSizes.map(size=>{const button=document.createElement('button');button.textContent=String(size);button.dataset.size=String(size);button.onclick=()=>dispatch({type:'size',value:size});return button;}));
$('#branch-filters').replaceChildren(...branchFilters.map(filter=>{
  const group=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=filter.label;group.append(legend);
  filter.options.forEach((text,index)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=filter.id;input.checked=index===filter.selected;input.value=String(index);input.onchange=()=>dispatch({type:'filter',id:filter.id,value:index});label.append(input,document.createTextNode(text));group.append(label);});return group;
}));
$('#customer-columns').replaceChildren(...branchColumns.map(text=>{const th=document.createElement('th');th.scope='col';th.textContent=text;return th;}));
function messageRow(text){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent=text;tr.append(td);return tr;}
async function loadResults(){
  const current=++sequence;closeMenu();$('#request-error').textContent='';$('#retry').hidden=true;$('#request-state').textContent='در حال بارگذاری…';$('#customer-table').setAttribute('aria-busy','true');$('#customer-rows').replaceChildren(messageRow('در حال دریافت اطلاعات از سرور محلی…'));$('#pagination').replaceChildren();
  $('#create-customer').disabled=dataset==='demo';$('#dataset-notice').textContent=dataset==='demo'?'تمام ردیف‌ها و اعداد این مجموعه مصنوعی و آزمایشی هستند؛ ثبت در مجموعه نمایشی غیرفعال است.':'فقط اطلاعات ثبت‌شده در حساب محلی شما؛ داده‌های SmartX وارد نشده‌اند.';
  const params=new URLSearchParams({dataset,q:state.query,page:String(state.page),pageSize:String(state.pageSize),...Object.fromEntries(Object.entries(state.filters).map(([k,v])=>[k,String(v)]))});
  try{const view=await request('/customers?'+params);if(current!==sequence)return;state={...state,page:view.page};renderResults(view);$('#request-state').textContent=view.filtered?'اطلاعات محلی بارگذاری شد.':'نتیجه‌ای مطابق نیست.';}
  catch(error){if(current!==sequence)return;$('#customer-rows').replaceChildren(messageRow('اطلاعات بارگذاری نشد.'));$('#total-count').textContent='';$('#filtered-count').textContent='';$('#request-error').textContent=error.message;$('#request-state').textContent='';$('#retry').hidden=false;if(error.status===401)location.replace('/login.html');}
  finally{if(current===sequence)$('#customer-table').setAttribute('aria-busy','false');}
}
function rowMenu(row){
  const wrapper=document.createElement('div');wrapper.className='row-menu';const button=document.createElement('button');button.textContent='سایر';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','menu-'+row.id);
  const content=document.createElement('div');content.id='menu-'+row.id;content.hidden=true;content.className='menu-content';
  if(dataset==='live'){const basic=document.createElement('button');basic.textContent='اطلاعات پایهٔ محلی';basic.onclick=async()=>{try{const item=await request('/customers/'+encodeURIComponent(row.id));$('#basic-info').textContent=`${item.name} / ${item.mobile}`;$('#basic-dialog').showModal();closeMenu();}catch(error){$('#request-error').textContent=error.message;}};content.append(basic);}
  content.append(...unavailableActions.slice(3).map(disabledButton));button.onclick=()=>{const wasOpen=openMenu?.button===button;closeMenu();if(!wasOpen){content.hidden=false;button.setAttribute('aria-expanded','true');openMenu={wrapper,button,content};}};wrapper.append(button,content);return wrapper;
}
function renderResults(view){
  $('#total-count').textContent=`تعداد کل${dataset==='demo'?' (مصنوعی)':''}: ${view.total}`;$('#filtered-count').textContent=`تعداد فیلتر شده ها${dataset==='demo'?' (مصنوعی)':''}: ${view.filtered}`;
  document.querySelectorAll('[data-size]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.size)===state.pageSize)));
  const rows=view.rows.map(row=>{const tr=document.createElement('tr');tr.dataset.customerId=row.id;if(row.synthetic)tr.dataset.syntheticId=row.id;
    for(const value of [row.name,row.mobile,row.credit===null?'نامشخص':row.credit.toLocaleString('fa-IR'),row.lastPurchase||'نامشخص',row.totalPurchase===null?'نامشخص':row.totalPurchase.toLocaleString('fa-IR'),row.group||'تعیین نشده']){const td=document.createElement('td');td.textContent=value;tr.append(td);}const actions=document.createElement('td');actions.append(rowMenu(row));tr.append(actions);return tr;});
  $('#customer-rows').replaceChildren(...(rows.length?rows:[messageRow(dataset==='demo'?'هیچ ردیفی در داده‌های مصنوعی مطابق نیست.':'مشتری محلی مطابق نیست؛ می‌توانید اطلاعات پایهٔ مشتری جدید ثبت کنید.')]));
  const pages=[...new Set([1,view.page-1,view.page,view.page+1,view.pages])].filter(page=>page>=1&&page<=view.pages).sort((a,b)=>a-b);
  const makePage=(label,page,boundary=false)=>{const button=document.createElement('button');button.textContent=label;if(!boundary&&page===view.page)button.setAttribute('aria-current','page');button.disabled=boundary&&page===view.page;button.onclick=()=>dispatch({type:'page',value:page});return button;};
  const buttons=[makePage('صفحه اول',1,true)];pages.forEach((page,index)=>{if(index&&page-pages[index-1]>1)buttons.push(document.createTextNode('…'));buttons.push(makePage(String(page),page));});buttons.push(makePage('صفحه آخر',view.pages,true));$('#pagination').replaceChildren(...buttons);
}
const form=$('#customer-form');
$('#create-customer').onclick=()=>{form.reset();for(const id of ['#name-error','#mobile-error','#form-error'])$(id).textContent='';$('#customer-dialog').showModal();};
$('#cancel-customer').onclick=()=>{if(!saving)$('#customer-dialog').close();};
$('#close-basic').onclick=()=>$('#basic-dialog').close();
form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;$('#save-customer').disabled=true;$('#form-error').textContent='در حال ذخیره…';$('#name-error').textContent='';$('#mobile-error').textContent='';
  try{const row=await request('/customers',{method:'POST',body:JSON.stringify({name:form.elements.name.value,mobile:form.elements.mobile.value})});$('#customer-dialog').close();state=initialBranchState();state={...state,draft:row.mobile,query:row.mobile};$('#search').value=row.mobile;document.querySelectorAll('#branch-filters input').forEach(input=>{input.checked=Number(input.value)===state.filters[input.name];});await loadResults();$('#request-state').textContent='اطلاعات پایه در پایگاه محلی ذخیره شد.';}
  catch(error){$('#form-error').textContent=error.message;$('#name-error').textContent=error.fields?.name||'';$('#mobile-error').textContent=error.fields?.mobile||'';}
  finally{saving=false;$('#save-customer').disabled=false;}
};
try{const session=await requireSession();$('#auth-user').textContent='حساب محلی: '+session.user.username;await loadResults();}catch(error){$('#request-error').textContent=error.message;}
