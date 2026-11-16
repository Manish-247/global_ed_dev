const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
process.env.JWT_SECRET='staff-events-test-secret';
let queryCalls=0;
const rows=[{id:1,program_id:10,staff_id:7},{id:2,program_id:20,staff_id:8},{id:3,program_id:20,staff_id:null}];
require.cache[require.resolve('../db')]={exports:{execute:async(sql,params)=>{
 queryCalls++;
 assert.deepEqual(params,[]);
 assert.match(sql,/p.id AS program_id/);
 assert.match(sql,/LEFT JOIN staff s ON s.id = pe.staff_id/);
 assert.match(sql,/LEFT JOIN meeting_points/);
 assert.match(sql,/p.is_deleted = 0/);
 assert.match(sql,/pe.is_deleted = 0 AND e.is_deleted = 0/);
 assert.doesNotMatch(sql,/staff_locations|s.id = \?/);
 return [rows];
}}};
const router=require('../routes/staff');
test('staff can list all programs and unassigned events; other roles cannot',async()=>{
 const app=express();app.use(router);
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 try {
  for(const role of [null,'student','faculty','staff']) {
   const response=await fetch(`http://127.0.0.1:${server.address().port}/events`,{headers:role?{Authorization:`Bearer ${jwt.sign({id:7,role},process.env.JWT_SECRET)}`}:{}});
   assert.equal(response.status,role==='staff'?200:role?403:401);
   if(role==='staff') assert.deepEqual(await response.json(),rows);
  }
  assert.equal(queryCalls,1);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
