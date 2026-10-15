import test from 'node:test';
import assert from 'node:assert/strict';
import {requirePhone,presenceLocation,missionAction} from '../tgcloud/lib/mobile-presence.js';
const w={id:'w1',lat:35,lng:51,radius:100};
const loc={lat:35,lng:51,accuracy:10};
test('desktop and missing device hints are denied',()=>{
 for(const d of [null,{platform:'tdesktop',mobile:true},{platform:'ios',mobile:false}])assert.throws(()=>requirePhone(d));
 requirePhone({platform:'android',mobile:true});requirePhone({platform:'ios',mobile:true});
});
test('geofence requires valid configured coordinates and uncertainty inside radius',()=>{
 assert.equal(presenceLocation(w,loc).workplace,'w1');
 for(const workplace of [null,{...w,lat:''},{...w,status:'غیر فعال'}])assert.throws(()=>presenceLocation(workplace,loc));
 for(const location of [{...loc,accuracy:51},{...loc,lat:36},{...loc,lat:35.0008,accuracy:20}])assert.throws(()=>presenceLocation(w,location));
});
test('missions are scoped by state and personnel and cannot start or close twice',()=>{
 const a={},b={},meta=presenceLocation(w,loc);
 const m=missionAction(a,'p1','mission_start',meta,7);
 assert.throws(()=>missionAction(a,'p1','mission_start',meta,7));
 assert.throws(()=>missionAction(a,'p2','mission_end',meta,8));
 assert.throws(()=>missionAction(b,'p1','mission_end',meta,7));
 assert.equal(missionAction(a,'p1','mission_end',meta,7).id,m.id);
 assert.ok(m.endedAt);assert.throws(()=>missionAction(a,'p1','mission_end',meta,7));
});
