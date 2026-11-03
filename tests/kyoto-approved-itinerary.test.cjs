'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../core.js');
const Multi=require('../multi-day-core.js');
const Next=require('../next-step-core.js');

const days=['2026-11-03','2026-11-04','2026-11-05','2026-11-06'];
const counts=[4,4,4,5];
const names={
  '2026-11-03':['Ginkaku-ji (Silberner Pavillon)','Philosophenweg (Tetsugaku no Michi)','Nanzen-ji','Nishiki-Markt (optional)'],
  '2026-11-04':['Nara-Park','Tōdai-ji (Große Buddha-Halle)','Kasuga-Taisha','Naramachi (historisches Viertel)'],
  '2026-11-05':['Osaka Castle / Burghauptturm','Kuromon Ichiba Market','Shinsaibashi-suji','Dōtonbori (Neonviertel)'],
  '2026-11-06':['Kinkaku-ji (Goldener Pavillon)','Ryōan-ji (Steingarten)','Tenryū-ji','Arashiyama Bambuswald','Arashiyama Bamboo Light-up (Abend)']
};
const preset=Core.presetPlaces('town-kyoto');
function dateOf(p){return Multi.fromSchedule(p.schedule);}

test('the approved weather itinerary contains exactly the 17 agreed stops',()=>{
  assert.equal(new Set(preset.map(Core.placePlanKey)).size,preset.length,'distinct place keys');
  days.forEach((date,i)=>{
    const dayStops=preset.filter(p=>dateOf(p)===date);
    assert.equal(dayStops.length,counts[i],date);
    assert.deepEqual(dayStops.map(p=>p.name),names[date],date);
    assert.ok(dayStops.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)));
  });
});

test('each day has a distinct selection and keeps the Kyoto hotel visible',()=>{
  const assignments=Object.create(null);
  const tags=Object.create(null);
  for(const p of preset){
    const key=Core.placePlanKey(p);
    tags[key]=['town-kyoto'];
  }
  const seeded=Multi.seedDayAssignments(preset,tags,Core.placePlanKey,'town-kyoto');
  for(const day of days){
    const dayStops=Multi.selected(preset,seeded,day,Core.placePlanKey);
    assert.equal(dayStops.filter(p=>p.category==='hotel').length,1);
    assert.deepEqual(dayStops.filter(p=>p.category!=='hotel').map(p=>p.name),names[day]);
  }
  const a=preset.find(p=>p.name==='Nara-Park'),key=Core.placePlanKey(a);
  const moved=Multi.change(seeded,key,'2026-11-06');
  assert.equal(moved[key],'2026-11-06');
  assert.equal(seeded[key],'2026-11-04','changing one day must not mutate the existing assignments');
});

test('Today shortcuts target the correct Kyoto days and never claim booked tickets',()=>{
  days.forEach((day,index)=>{
    const suggestion=Next.todaySuggestion(new Date(day+'T03:00:00Z'));
    assert.equal(suggestion.planId,'town-kyoto');
    assert.equal(suggestion.date,day);
    assert.equal(suggestion.dayIndex,index+2);
    assert.ok(!/tickets sind gebucht/i.test(suggestion.hint));
  });
  assert.equal(Next.todaySuggestion(new Date('2026-11-07T03:00:00Z')).planId,'ride-nikko');
});

test('the two visited sights remain under 02 Nov and Nara/Osaka are not rail bookings',()=>{
  const visited=['Kiyomizu-dera','Fushimi Inari-Taisha'];
  visited.forEach(name=>{
    const p=preset.find(x=>x.name===name);
    assert.ok(p);
    assert.equal(dateOf(p),'2026-11-02');
  });
  const light=preset.find(p=>p.name==='Arashiyama Bamboo Light-up (Abend)');
  assert.match(light.note,/Ticket NICHT gekauft/);
  assert.match(light.schedule,/18:00/);
});
