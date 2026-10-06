import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, candidates, validate, encode, decode } from '../waitlist-model.js';
const base = { id:'a', memberId:'member', name:'회원', phone:'010', type:'장기', coachId:'coach', coachName:'강사', days:'2,4', from:'2026-10-01', until:'2026-10-31', start:'09:00', end:'11:00', status:'대기', memo:'=formula', created:'2026-10-01T00:00:00Z', updated:'v1' };
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
