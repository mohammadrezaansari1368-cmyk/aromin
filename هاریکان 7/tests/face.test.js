import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFace,faceImage} from '../tgcloud/lib/face.js';
import {initialData,route} from '../tgcloud/lib/tenant-domain.js';
const image='data:image/jpeg;base64,'+'A'.repeat(120),person={id:'p1',faceReference:image};
test('employer yes makes face mandatory but cannot declare a provider connected',()=>{
 const a=initialData(),b=initialData();
 route(a,'/admin/settings/faceService','PUT',{value:{hasService:true,provider:'Service',connectionStatus:'connected',apiKey:'never-store'}},7);
 assert.equal(a.settings.faceService.required,true);assert.equal(a.settings.faceService.connectionStatus,'not_connected');assert.equal(a.settings.faceService.apiKey,undefined);assert.equal(b.settings.faceService,undefined);
});
test('missing reference, missing adapter, mismatch and missing liveness fail closed',async()=>{
 const state={settings:{faceService:{hasService:true}}};
 await assert.rejects(verifyFace(state,{id:'p1'},image));
 await assert.rejects(verifyFace(state,person,image));
 for(const response of [{matched:false,live:true,receipt:'r'},{matched:true,live:false,receipt:'r'},{matched:true,live:true}])await assert.rejects(verifyFace(state,person,image,async()=>response));
 const verified=await verifyFace(state,person,image,async input=>{assert.equal(input.reference,image);return {matched:true,live:true,receipt:'server-receipt'};});
 assert.equal(verified.receipt,'server-receipt');assert.equal(await verifyFace({settings:{}},person,null),null);
});
test('reject oversized or unsupported face image',()=>{
 assert.throws(()=>faceImage('data:image/svg+xml;base64,'+'A'.repeat(120)));
 assert.throws(()=>faceImage('data:image/jpeg;base64,'+'A'.repeat(180001)));
});
