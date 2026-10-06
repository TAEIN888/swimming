import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, candidates, validate, encode, decode } from '../waitlist-model.js';
const base = { id:'a', memberId:'member', name:'회원', phone:'010', type:'장기', coachId:'coach', coachName:'강사', days:'2,4', from:'2026-10-01', until:'2026-10-31', start:'09:00', end:'11:00', status:'대기', memo:'=formula', created:'2026-10-01T00:00:00Z', updated:'v1', timeRanges:'' };
const slot = { coachId:'coach', date:'2026-10-06', start:'09:00', end:'10:00' };
test('matches full lesson, coach, weekday and inclusive date boundaries', () => {
 assert.equal(matches(base,slot),true);
 for (const change of [{coachId:'other'},{date:'2026-10-07'},{date:'2026-11-03'},{start:'08:59'},{end:'11:01'},{end:'09:00'}]) assert.equal(matches(base,{...slot,...change}),false);
 assert.equal(matches({...base,from:slot.date,until:slot.date},slot),true);
 assert.equal(matches({...base,coachId:'',until:''},{...slot,date:'2027-10-05',coachId:'other'}),true);
});
test('single date and inactive requests are excluded', () => {
 assert.equal(matches({...base,type:'단발',from:slot.date,until:slot.date,days:''},slot),true);
 assert.equal(matches({...base,type:'단발',from:'2026-10-05'},slot),false);
 for (const status of ['연결완료','취소']) assert.equal(matches({...base,status},slot),false);
});
test('oldest qualifying request first, one candidate per member', () => {
 const newer = {...base,id:'b',created:'2026-10-02T00:00:00Z'};
 assert.deepEqual(candidates([newer,base,{...newer,id:'c',memberId:'another'}],slot).map(r=>r.id),['a','c']);
});
test('revision round trip retains latest record and raw content', () => {
 const changed = {...base,status:'취소',updated:'v2'};
 assert.deepEqual(decode([encode(base),[],encode(changed)]),[changed]);
});
test('invalid date range, hours and missing recurring weekdays rejected', () => {
 validate(base);
 for (const change of [{until:'2026-09-30'},{end:'08:00'},{days:''},{start:'25:00'},{type:'단발',until:'2026-10-02'},{status:'invalid'}]) assert.throws(()=>validate({...base,...change}));
});

test('multiple windows match separately and never bridge the gap', () => {
 const record = {...base,days:'3',timeRanges:JSON.stringify([{start:'13:00',end:'15:00'},{start:'17:00',end:'19:00'}])};
 const wednesday = {...slot,date:'2026-10-07'};
 validate(record);
 assert.equal(matches(record,{...wednesday,start:'13:00',end:'15:00'}),true);
 assert.equal(matches(record,{...wednesday,start:'17:00',end:'19:00'}),true);
 assert.equal(matches(record,{...wednesday,start:'15:00',end:'17:00'}),false);
 assert.equal(matches(record,{...wednesday,start:'14:00',end:'18:00'}),false);
 assert.equal(matches(record,{...wednesday,date:'2026-10-08',start:'13:00',end:'14:00'}),false);
 assert.deepEqual(decode([encode(record)]),[record]);
});
test('legacy 16-column rows retain original single-window behavior', () => {
 const legacy = decode([encode(base).slice(0,16)])[0];
 assert.equal(legacy.timeRanges,'');
 assert.equal(matches(legacy,slot),true);
 validate(legacy);
});
test('every window is validated and malformed saved data cannot match', () => {
 for (const timeRanges of ['[]', 'invalid', '{}', '[null]', '[{"start":"13:00","end":"15:00"},{"start":"19:00","end":"17:00"}]']) {
   assert.throws(()=>validate({...base,timeRanges}));
 }
 assert.equal(matches({...base,timeRanges:'invalid'},slot),false);
 assert.equal(matches({...base,timeRanges:'[null]'},slot),false);
});

test('start-only requests match exact start without assuming lesson duration', () => {
 const request = {...base,timeRanges:JSON.stringify([{mode:'start',start:'13:00',end:''},{mode:'start',start:'17:00',end:''}])};
 validate(request);
 for (const end of ['13:30','15:00','18:00']) assert.equal(matches(request,{...slot,start:'13:00',end}),true);
 assert.equal(matches(request,{...slot,start:'17:00',end:'19:00'}),true);
 assert.equal(matches(request,{...slot,start:'13:01',end:'14:00'}),false);
 assert.equal(matches(request,{...slot,start:'14:00',end:'15:00'}),false);
 assert.deepEqual(decode([encode(request)]),[request]);
});
test('start-only mode still requires valid starts and explicit range ends', () => {
 for (const range of [{mode:'start',start:'',end:''},{mode:'start',start:'25:00',end:''},{mode:'range',start:'13:00',end:''},{mode:'other',start:'13:00',end:'15:00'}]) {
   assert.throws(()=>validate({...base,timeRanges:JSON.stringify([range])}));
 }
});

test('specific date searches every coach and combines single and recurring requests', async () => {
 const {dateCandidates}=await import('../waitlist-model.js');
 const records=[{...base,days:'3'}, {...base,id:'b',memberId:'second',coachId:'another',type:'단발',from:'2026-10-07',until:'2026-10-07',created:'2026-10-02'}, {...base,id:'c',memberId:'third',days:'4'}];
 assert.deepEqual(dateCandidates(records,{date:'2026-10-07',start:'09:00'}).map(r=>r.id),['a','b']);
});
test('single dates do not match other dates sharing the same weekday', async () => {
 const {dateCandidates}=await import('../waitlist-model.js');
 const single={...base,type:'단발',from:'2026-10-07',until:'2026-10-07'};
 assert.equal(dateCandidates([single],{date:'2026-10-07',start:'09:00'}).length,1);
 assert.equal(dateCandidates([single],{date:'2026-10-14',start:'09:00'}).length,0);
 assert.equal(dateCandidates([single],{date:'2026-09-30',start:'09:00'}).length,0);
});
test('recurring requests honor chosen date, weekday and inclusive period bounds', async () => {
 const {dateCandidates}=await import('../waitlist-model.js');
 const record={...base,days:'3',from:'2026-10-07',until:'2026-10-14'};
 for(const [date,count] of [['2026-10-07',1],['2026-10-14',1],['2026-10-08',0],['2026-09-30',0],['2026-10-21',0]]) assert.equal(dateCandidates([record],{date,start:'09:00'}).length,count);
 assert.equal(dateCandidates([{...record,until:''}],{date:'2027-10-06',start:'09:00'}).length,1);
});
test('date search respects exact starts, multiple ranges and no end-time requirement', async () => {
 const {dateCandidates}=await import('../waitlist-model.js');
 const record={...base,days:'3',timeRanges:JSON.stringify([{mode:'start',start:'13:00',end:''},{mode:'range',start:'17:00',end:'19:00'}])};
 for(const [start,count] of [['13:00',1],['13:01',0],['17:00',1],['18:00',1],['19:00',0],['15:00',0]]) assert.equal(dateCandidates([record],{date:'2026-10-07',start}).length,count);
});
test('date search excludes completed requests, invalid dates and duplicate members', async () => {
 const {dateCandidates}=await import('../waitlist-model.js');
 const query={date:'2026-10-07',start:'09:00'},record={...base,days:'3'};
 assert.equal(dateCandidates([record,{...record,id:'b'}],query).length,1);
 for(const status of ['취소','연결완료']) assert.equal(dateCandidates([{...record,status}],query).length,0);
 for(const change of [{date:''},{date:'2026-02-30'},{date:'2026-13-01'},{start:'25:00'}]) assert.deepEqual(dateCandidates([record],{...query,...change}),[]);
});

test('registration and date search accept only whole hours', async () => {
 const {isWholeHour,dateCandidates}=await import('../waitlist-model.js');
 for(const hour of ['00:00','01:00','12:00','23:00']) assert.equal(isWholeHour(hour),true);
 for(const invalid of ['13:30','13:01','24:00','9:00','',null]) assert.equal(isWholeHour(invalid),false);
 assert.throws(()=>validate({...base,start:'09:30'}));
 assert.throws(()=>validate({...base,end:'11:30'}));
 assert.throws(()=>validate({...base,timeRanges:JSON.stringify([{mode:'start',start:'13:30',end:''}])}));
 assert.deepEqual(dateCandidates([{...base,days:'3',start:'13:00',end:'15:00'}],{date:'2026-10-07',start:'13:30'}),[]);
});
test('legacy minute data is read unchanged and is not silently rounded', async () => {
 const {dateCandidates}=await import('../waitlist-model.js');
 const legacy={...base,days:'3',start:'13:30',end:'15:30'};
 assert.deepEqual(decode([encode(legacy)]),[legacy]);
 assert.equal(dateCandidates([legacy],{date:'2026-10-07',start:'13:00'}).length,0);
 assert.equal(dateCandidates([legacy],{date:'2026-10-07',start:'14:00'}).length,1);
 assert.throws(()=>validate(legacy));
});

test('deleted requests stay excluded after reloading all revisions', () => {
 const deleted = {...base,status:'삭제',updated:'v3'};
 const other = {...base,id:'b',memberId:'other'};
 assert.deepEqual(decode([encode(base),encode(other),encode({...base,updated:'v2'}),encode(deleted)]),[other]);
 assert.deepEqual(candidates(decode([encode(base),encode(deleted)]),slot),[]);
});
