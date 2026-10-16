import test from 'node:test';
import assert from 'node:assert/strict';
import {initialData,route} from '../tgcloud/lib/tenant-domain.js';
import {dayRow} from '../tgcloud/lib/core.js';
import {recordLocation} from '../tgcloud/lib/location.js';
test('advanced shifts save once and remain in their business',()=>{
 const a=initialData(),b=initialData();
 const payload={name:'Advanced',type:'custom',year:1405,days:[{date:'2026-03-21',kind:'fixed',p1_start:'08:00',p1_end:'12:00',p2_start:'16:00',p2_end:'20:00'}],rules:{late_grace:15},settings:{add_grace_to_worktime:true}};
 const saved=route(a,'/admin/advanced-shifts','POST',payload,11).result;
 assert.equal(b.data.shifts.length,0);
 const read=route(a,'/admin/advanced-shifts/'+saved.id).result;
 assert.equal(read.days[0].p2_start,'16:00');assert.equal(read.rules.late_grace,15);
 const p={id:'person',shift:saved.id};
 const row=dayRow({...a.data,attendance:[{person:'person',date:'1405/01/01',in:'08:10',out:'12:00'},{person:'person',date:'1405/01/01',in:'16:00',out:'20:00'}]},p,'1405/01/01');
 assert.equal(row.expected,480);assert.equal(row.absent,0);assert.equal(row.worked,480);
});
test('duplicate and out-of-year shift dates are rejected',()=>{
 const a=initialData(),day={date:'2026-03-21',kind:'fixed',p1_start:'08:00',p1_end:'16:00'};
 assert.throws(()=>route(a,'/admin/advanced-shifts','POST',{name:'A',type:'custom',year:1405,days:[day,day]},11));
 assert.throws(()=>route(a,'/admin/advanced-shifts','POST',{name:'A',type:'custom',year:1405,days:[{...day,date:'2020-01-01'}]},11));
});
test('location records use server identity and remain in one business',()=>{
 const a=initialData(),b=initialData();const p=recordLocation(a,{lat:0,lng:0,accuracy:10,actor:999,person:'spoof'},11,'person');
 assert.equal(p.actor,11);assert.equal(p.person,'person');assert.equal(b.locations,undefined);
 assert.throws(()=>recordLocation(a,{lat:NaN,lng:0,accuracy:10},11));
 assert.throws(()=>recordLocation(a,{lat:0,lng:0,accuracy:9999},11));
});
