import test from 'node:test';
import assert from 'node:assert/strict';
import {initialData,route} from '../tgcloud/lib/tenant-domain.js';
test('setup cannot finish without a valid workplace and linked active employee and shift',()=>{
 const a=initialData(),b=initialData(),finish=()=>route(a,'/admin/settings/onboarding','PUT',{value:{completed:true}},7);
 assert.throws(finish);
 a.data.workplaces.push({id:'w',lat:35,lng:51,status:'فعال'});a.data.shifts.push({id:'s'});
 a.data.personnel.push({id:'p',status:'فعال',workplace:'foreign',shift:'s'});assert.throws(finish);
 a.data.personnel[0].workplace='w';a.data.personnel[0].shift='foreign';assert.throws(finish);
 a.data.personnel[0].shift='s';finish();assert.equal(a.settings.onboarding.completed,true);assert.equal(b.settings.onboarding,undefined);
 a.data.workplaces[0].lat='';assert.throws(finish);
});
