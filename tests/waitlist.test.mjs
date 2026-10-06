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
