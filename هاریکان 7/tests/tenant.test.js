import {employeeByPhone,normalizeMobile,cleanEmployer} from '../tgcloud/lib/identity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData,authorize,route,employeeForBusiness } from '../tgcloud/lib/tenant-domain.js';
test('verified owner is required; supplied owner metadata cannot grant access',()=>{
 assert.throws(()=>authorize({ownerId:11},12));
 assert.throws(()=>authorize(null,11));
 assert.throws(()=>authorize({ownerId:11},'11'));
 authorize({ownerId:11},11);
});
test('new businesses share no arrays, settings, or employee demo data',()=>{
 const a=initialData(),b=initialData();
 route(a,'/admin/c/workplaces','POST',{name:'A'},11);
 route(a,'/admin/settings/timezone','PUT',{value:'Asia/Tehran'},11);
 assert.equal(b.data.workplaces.length,0);assert.deepEqual(b.settings,{});
 assert.equal(a.data.personnel.length,0);
});
test('server controls identifiers and discards tenant fields',()=>{
 const a=initialData();const{result}=route(a,'/admin/c/groups','POST',{name:'G',id:'spoof',ownerId:12,businessId:55},11);
 assert.notEqual(result.id,'spoof');assert.equal(result.ownerId,undefined);assert.equal(result.businessId,undefined);
 assert.equal(a.audit[0].actor,11);
});
test('cross-business record identifiers cannot be read or updated',()=>{
 const a=initialData(),b=initialData();const{result}=route(a,'/admin/c/groups','POST',{name:'A'},11);
 assert.equal(route(b,'/admin/c/groups/'+result.id).result,null);
 assert.throws(()=>route(b,'/admin/c/groups/'+result.id,'PUT',{name:'B'},12));
});
test('foreign references and duplicate personnel are rejected',()=>{
 const a=initialData();assert.throws(()=>route(a,'/admin/c/personnel','POST',{firstName:'A',lastName:'B',code:'1',username:'a',mobile:'09120000000',workplace:'foreign'},11));
 const row={firstName:'A',lastName:'B',code:'1',username:'a',mobile:'09120000000'};
 route(a,'/admin/c/personnel','POST',row,11);
 assert.throws(()=>route(a,'/admin/c/personnel','POST',row,11));
});
test('passwords and unsupported SMS do not get silently accepted',()=>{
 const a=initialData();assert.throws(()=>route(a,'/admin/c/personnel','POST',{password:'secret'},11));
 assert.throws(()=>route(a,'/admin/c/messages','POST',{title:'x',body:'y',sms:true},11));
});
test('stale row updates cannot overwrite a newer edit',()=>{
 const a=initialData();const{result}=route(a,'/admin/c/groups','POST',{name:'A'},11);
 const first=route(a,'/admin/c/groups/'+result.id,'PUT',{name:'B'},11).result;
 assert.equal(first._version,1);
 assert.throws(()=>route(a,'/admin/c/groups/'+result.id,'PUT',{name:'C'},11));
 assert.equal(a.data.groups[0].name,'B');
});
test('referenced records cannot be removed',()=>{
 const a=initialData();const w=route(a,'/admin/c/workplaces','POST',{name:'W'},11).result;
 route(a,'/admin/c/personnel','POST',{firstName:'A',lastName:'B',code:'1',username:'a',mobile:'09120000000',workplace:w.id},11);
 assert.throws(()=>route(a,'/admin/c/workplaces/'+w.id,'DELETE',null,11));
});
test('employee identity belongs only to its business and active record',()=>{
 const a={ownerId:11,state:initialData()},b={ownerId:12,state:initialData()};
 a.state.data.personnel.push({id:'a',telegramId:'33',status:'فعال'});
 b.state.data.personnel.push({id:'b',telegramId:'44',status:'فعال'});
 assert.equal(employeeForBusiness(a,33).id,'a');
 assert.equal(employeeForBusiness(b,33),null);
 assert.equal(employeeForBusiness(a,'33'),null);
 assert.throws(()=>authorize(a,33));
 a.state.data.personnel[0].status='غیر فعال';
 assert.equal(employeeForBusiness(a,33),null);
});

test('only verified mobile entered by employer unlocks that business',()=>{
 const a={state:initialData()},b={state:initialData()};
 a.state.data.personnel.push({id:'p',mobile:'09120000000',telegramId:'999',status:'فعال'});
 assert.equal(employeeByPhone(a,'+989120000000').id,'p');
 assert.equal(employeeByPhone(b,'+989120000000'),null);
 assert.equal(employeeByPhone(a,'09120000001'),null);
 assert.equal(employeeByPhone(a,null),null);
 assert.equal(normalizeMobile('۰۹۱۲۰۰۰۰۰۰۰'),'09120000000');
 a.state.data.personnel[0].status='غیر فعال';assert.equal(employeeByPhone(a,'09120000000'),null);
});
test('employer fields and both private documents are mandatory',()=>{
 assert.throws(()=>cleanEmployer({companyName:'Aromin'}));
 assert.throws(()=>cleanEmployer({firstName:'Test',lastName:'Owner',companyName:'Test',phone:'02100000000',mobile:'09120000000'}));
});
