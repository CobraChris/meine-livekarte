/* Deterministic on-device suggestions from the existing approved travel plan.
 * No GPS reads, routing calls, external services or automatic task completion.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.NextStepCore=api;
})(typeof window!=='undefined'?window:undefined,function(){
  const TRAVEL_DATE='2026-11-01';
  const KYOTO_DAY2='2026-11-02';
  const localDate=(date=new Date())=>{
    // Japan local date is always explicit, independent of the device timezone.
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(date);
    const field=name=>parts.find(x=>x.type===name)?.value;
    return field('year')+'-'+field('month')+'-'+field('day');
  };
  // Explicit, approved itinerary dates only. Outside the known window we
  // deliberately make no assumptions about later train bookings or locations.
  function todaySuggestion(at=new Date()){
    const day=localDate(at);
    if(day==='2026-10-30'||day==='2026-10-31')
      return {date:day,planId:'town-takayama',dayIndex:null,
        title:'Takayama',summary:'Altstadt und Reisevorbereitung',
        hint:'Die Orte sind ein Vorschlag, keine bestätigten Besuche.'};
    if(day==='2026-11-01')
      return {date:day,planId:'ride-kyoto',dayIndex:0,
        title:'Fahrt nach Kyoto',summary:'Takayama → Nagoya → Kyoto',
        hint:'Zugzeiten sind Planwerte. Erledigte Schritte bleiben manuell bestätigt.'};
    if(day==='2026-11-02')
      return {date:day,planId:'town-kyoto',dayIndex:1,
        title:'Kyoto · Higashiyama & Fushimi Inari',
        summary:'Kiyomizu-dera · Sannenzaka/Ninenzaka · Fushimi Inari',
        hint:'Besichtigungen sind freiwillig; Zeitangaben sind keine Live-Auskunft.'};
    if(day==='2026-11-03')
      return {date:day,planId:'town-kyoto',dayIndex:2,
        title:'Kyoto · östliche Tempel',
        summary:'Ginkaku-ji · Philosophenweg · Nanzen-ji · Nishiki-Markt optional',
        hint:'Bestätigter Tagesplan, Start ca. 10:30. Zeiten sind Richtwerte, keine Reservierungen.'};
    if(day==='2026-11-04')
      return {date:day,planId:'town-kyoto',dayIndex:3,
        title:'Nara · Tagesausflug',
        summary:'Nara-Park · Tōdai-ji · Kasuga-Taisha · Naramachi',
        hint:'Abfahrt Kyoto ca. 10:00. Zugverbindungen und Wetter am Tag selbst prüfen.'};
    if(day==='2026-11-05')
      return {date:day,planId:'town-kyoto',dayIndex:4,
        title:'Osaka · wetterflexibler Ausflug',
        summary:'Osaka Castle · Kuromon-Markt · Shinsaibashi · Dōtonbori',
        hint:'Morgens möglicherweise Regen; Museum, Markt und Einkaufsstraße lassen sich flexibel nutzen.'};
    if(day==='2026-11-06')
      return {date:day,planId:'town-kyoto',dayIndex:5,
        title:'Kyoto · Arashiyama & Lichterabend',
        summary:'Kinkaku-ji · Ryōan-ji · Togetsukyō-Brücke · Tenryū-ji · Bambuswald · Light-up',
        hint:'Start ca. 13:00. Brücke um 15:40 vor Tenryū-ji, Light-up ab 18:00. Eintritt nicht gebucht; Transfers prüfen.'};
    if(day==='2026-11-07'){
      const hour=Number(new Intl.DateTimeFormat('en-US',{
        timeZone:'Asia/Tokyo',hour:'2-digit',hourCycle:'h23'
      }).format(at));
      return hour>=16
        ?{date:day,planId:'town-nikko',dayIndex:0,
          title:'Nikkō · Light-up-Abend',
          summary:'HaruNikko New Wing · Shinkyō-Brücke · Shōyō-en-Garten · Futarasan',
          hint:'Light-up 17:00–21:00, Shōyō-en letzter Einlass 20:30. Kein Live-Navigations- oder Ticketstatus.'}
        :{date:day,planId:'ride-nikko',dayIndex:null,
          title:'Weiterreise Kyoto → Nikkō',
          summary:'Kyoto → Tokyo → Utsunomiya → Nikkō (JR)',
          hint:'Bisherige Planung, keine Live-Fahrzeiten. Zugzeiten und Tickets vor Abfahrt prüfen.'};
    }
    if(day==='2026-11-08')
      return {date:day,planId:'town-nikko',dayIndex:1,
        title:'Nikkō · Welterbestätten & Hotelwechsel',
        summary:'Rinnō-ji · Tōshō-gū · Futarasan · Taiyūin · Fairfield',
        hint:'Frühestens ca. 09:30 starten; Gepäcktransfer selbst organisieren. Kanmangafuchi optional.'};
    if(day==='2026-11-09')
      return {date:day,planId:'town-nikko',dayIndex:2,
        title:'Nikkō · Wasserfälle und Chūzenji-See',
        summary:'Bus über Irohazaka · Kegon-Wasserfall · Chūzenji-See',
        hint:'Start ca. 09:30; Ryūzu-Wasserfall optional, Busfahrplan und Wetter prüfen.'};
    if(day==='2026-11-10')
      return {date:day,planId:'ride-tokyo',dayIndex:null,
        title:'Nikkō → Tokio · SPACIA X 6',
        summary:'Fairfield → Tōbu-Nikkō 12:55 → Tokyo Skytree 14:40 → Oshiage (Hanzōmon) → Kinshichō → THE skM TOKYO',
        hint:'Ohne Taxi: zum Tōbu-Bahnhof ca. 30 Min. zu Fuß (Shuttle 11:00 nur mit Reservierung); Klook Standard Wagen 4, 05C/05D. Suica mindestens 1.571 ¥ je Person, empfohlen 2.000 ¥.'};
    return null;
  }
  function isPastTravelView(view,at=new Date()){
    const today=localDate(at);
    return view==='ride-takayama'&&today>'2026-10-30'||
      view==='ride-kyoto'&&today>'2026-11-01'||
      view==='town-takayama'&&today>'2026-11-01'||
      view==='town-kyoto'&&today>'2026-11-06'||
      view==='ride-nikko'&&today>'2026-11-07'||
      view==='ride-tokyo'&&today>'2026-11-10';
  }
  // Scheduled milestones only. All minute arithmetic uses Japan local clock,
  // never the device timezone or a guessed real-time train position.
  function kyotoDepartureClock(at=new Date()){
    const day=localDate(at);
    if(day<TRAVEL_DATE)return {phase:'future',minutesToStation:null,minutesToTrain:null};
    if(day>TRAVEL_DATE)return {phase:'past',minutesToStation:null,minutesToTrain:null};
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).formatToParts(at);
    const field=name=>Number(parts.find(p=>p.type===name)?.value);
    const nowMinutes=field('hour')*60+field('minute');
    const stationTarget=10*60+45,trainDeparture=11*60+35;
    if(nowMinutes<stationTarget)return {
      phase:'before-station',minutesToStation:stationTarget-nowMinutes,
      minutesToTrain:trainDeparture-nowMinutes
    };
    if(nowMinutes<trainDeparture)return {
      phase:'station-window',minutesToStation:0,
      minutesToTrain:trainDeparture-nowMinutes
    };
    return {phase:'departed',minutesToStation:0,minutesToTrain:0};
  }
  const destination=(name,lat,lng,japanese)=>({
    name,lat,lng,japanese:japanese||''
  });
  const stations={
    takayama:destination('Takayama Station',36.14113,137.25129,'高山駅'),
    nagoya:destination('Nagoya Station',35.17073,136.88184,'名古屋駅'),
    kyoto:destination('Kyoto Station',34.98535,135.75877,'京都駅'),
    hotel:destination('Tomoya Residence',35.0137,135.76181,'ともやレジデンス'),
    gion:destination('Gion Shirakawa',35.0054743,135.7736461,'祇園白川'),
    ponto:destination('Ponto-chō',35.00613,135.77109,'先斗町'),
    kiyomizu:destination('Kiyomizu-dera',34.994722,135.783056,'清水寺'),
    sannenzaka:destination('Sannenzaka / Ninenzaka',34.9973,135.781,'産寧坂・二寧坂'),
    fushimi:destination('Fushimi Inari-Taisha',34.967125,135.773108,'伏見稲荷大社')
  };
  const task=(id,time,title,note,place,source='manual',details='')=>({
    id,time,title,note,place,source,details
  });
  const travelTasks=()=>[
    task('kyoto:pickup','vor 11:35','Klook-Papiertickets abholen',
      'JR-Bahnhof Takayama · idealerweise etwa 10:45 dort sein. QR-Abholcode und Voucher bereithalten.',stations.takayama,'pickup','pickup'),
    task('kyoto:hida','11:35','Hida 8 nehmen',
      'Takayama → Nagoya · Wagen 2, Sitze 10C und 10D. Gleisanzeige prüfen.',stations.takayama,'rail:0','rail'),
    task('kyoto:transfer','14:04–14:26','In Nagoya umsteigen',
      '22 Minuten Puffer · laut Buchung Gleis 4 → 17; Bahnhofsanzeige hat Vorrang.',stations.nagoya,'manual','rail'),
    task('kyoto:nozomi','14:26','Nozomi 71 nehmen',
      'Nagoya → Kyoto · Wagen 4, Sitze 8D und 8E.',stations.nagoya,'rail:1','rail'),
    task('kyoto:hotel','ab ca. 15:15','Im Tomoya Residence einchecken',
      'Ab Kyoto Station Taxi oder Karasuma-Linie bis Karasuma Oike und etwa 7 Minuten Fußweg.',stations.hotel,'manual','city')
  ];
  const kyotoDay2=()=>[
    task('kyoto:kiyomizu','09:45–11:15','Kiyomizu-dera',
      'Tempelbesuch; Öffnungszeiten und Eintritt vor Ort prüfen.',stations.kiyomizu,'manual','city'),
    task('kyoto:sannenzaka','11:15–13:30','Sannenzaka / Ninenzaka',
      'Altstadtgassen inklusive Mittagessen.',stations.sannenzaka,'manual','city'),
    task('kyoto:fushimi','15:15–17:15','Fushimi Inari-Taisha',
      'Transferpuffer einkalkulieren; je nach Energie Torii-Weg hinaufgehen.',stations.fushimi,'manual','city')
  ];
  const preparatory=()=>[
    task('kyoto:prepare','für morgen','Klook-Voucher bereithalten',
      'Für die Zugfahrt am 01.11. QR-Abholcode, Buchungsanleitung und Sitzplätze prüfen. Morgen gegen 10:45 zum Bahnhof Takayama.',stations.takayama,'manual','pickup')
  ];
  function tasksFor(view,dateKey){
    if(!['town-takayama','ride-kyoto','town-kyoto'].includes(view))return [];
    if(view==='town-takayama')
      return dateKey<TRAVEL_DATE?preparatory():
        dateKey===TRAVEL_DATE?travelTasks():[];
    if(view==='ride-kyoto')return travelTasks();
    if(dateKey<=TRAVEL_DATE){
      return travelTasks().filter(t=>t.id==='kyoto:hotel');
    }
    // Sightseeing remains on the city timeline; it is never a mandatory checkbox.
    if(dateKey===KYOTO_DAY2)return [];
    return [];
  }
  function completed(task,context){
    if(task.source==='pickup')return context.pickupDone===true;
    if(task.source.startsWith('rail:')){
      return context.railDone?.[Number(task.source.slice(5))]===true;
    }
    return context.manualDone?.[task.id]===true;
  }
  function choose(view,dateKey,context={}){
    const tasks=tasksFor(view,dateKey);
    const entries=tasks.map(task=>({...task,done:completed(task,context)}));
    const doneCount=entries.filter(t=>t.done).length;
    const next=entries.find(t=>!t.done)||null;
    const dateLabel=view==='ride-kyoto'?'So. 01.11.2026':
      view==='town-takayama'&&dateKey<TRAVEL_DATE?'Morgen · So. 01.11.2026':
      view==='town-takayama'?'So. 01.11.2026':
      dateKey<=TRAVEL_DATE?'So. 01.11.2026':
      dateKey===KYOTO_DAY2?'Mo. 02.11.2026':'';
    return {entries,next,doneCount,total:entries.length,dateLabel};
  }
  // Timetable-only badges. A past time never implies a train was missed,
  // a ticket invalid or a task completed. Flexible evening plans have no deadline.
  const plannedEnd=Object.freeze({
    'kyoto:prepare':['2026-10-31','23:59'],
    'kyoto:pickup':['2026-11-01','11:35'],
    'kyoto:hida':['2026-11-01','11:35'],
    'kyoto:transfer':['2026-11-01','14:26'],
    'kyoto:nozomi':['2026-11-01','14:26'],
    'kyoto:kiyomizu':['2026-11-02','11:15'],
    'kyoto:sannenzaka':['2026-11-02','13:30'],
    'kyoto:fushimi':['2026-11-02','17:15']
  });
  const plannedDay=Object.freeze({
    'kyoto:prepare':'2026-10-31',
    'kyoto:pickup':'2026-11-01',
    'kyoto:hida':'2026-11-01',
    'kyoto:transfer':'2026-11-01',
    'kyoto:nozomi':'2026-11-01',
    'kyoto:hotel':'2026-11-01',
    'kyoto:gion':'2026-11-01',
    'kyoto:ponto':'2026-11-01',
    'kyoto:kiyomizu':'2026-11-02',
    'kyoto:sannenzaka':'2026-11-02',
    'kyoto:fushimi':'2026-11-02'
  });
  function taskTimeState(entry,at=new Date()){
    const day=plannedDay[entry?.id];
    if(!day)return 'unscheduled';
    const today=localDate(at);
    if(today>day)return 'past';
    if(today<day)return 'future';
    const schedule=plannedEnd[entry.id];
    if(!schedule)return 'flexible';
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).formatToParts(at);
    const field=name=>Number(parts.find(p=>p.type===name)?.value);
    const now=field('hour')*60+field('minute');
    const [hour,minute]=schedule[1].split(':').map(Number);
    return now>=hour*60+minute?'past':'upcoming';
  }
  // Preserve canonical manual statuses and ordering; only partition the
  // display. Completed tasks are excluded from the visible open list.
  function taskBuckets(entries,at=new Date()){
    const open=[],done=[];
    for(const task of entries||[]){
      if(task.done)done.push(task);
      else open.push({...task,timeState:taskTimeState(task,at)});
    }
    return {open,done,openCount:open.length,doneCount:done.length};
  }
  // Contingency helper: the booked connection is NOT a real-time rail feed.
  // Ticket use, refunds and changes for Klook-issued fares are deliberately
  // decided by JR staff/Klook, never automatically by this application.
  function trainProblem(kind,delayInput=null){
    const names={
      delay:'Hida 8 verspätet',
      missed:'Nozomi 71 verpasst',
      ticket:'Ticket oder Sperre funktioniert nicht',
      staff:'Personal um Hilfe bitten'
    };
    if(!Object.hasOwn(names,kind))throw new Error('Unbekanntes Zugproblem.');
    const input=typeof delayInput==='number'?String(delayInput):
      typeof delayInput==='string'?delayInput.trim():'';
    const delayMinutes=/^\d{1,3}$/.test(input)&&Number(input)<=180?
      Number(input):null;
    const shared='Klookで2人分の切符を購入しました。11月1日に高山から京都へ向かいます。\n'
      +'特急ひだ8号：高山11:35発、名古屋14:04着。\n'
      +'のぞみ71号：名古屋14:26発、京都15:00着（4号車、8D・8E）。\n';
    const instructions={
      delay:{
        title:'Hida 8 hat Verspätung',
        steps:[
          'Im Hida 8 beim Zugpersonal nachfragen, sobald der Anschluss unsicher wird.',
          'In Nagoya der Shinkansen-Anzeige folgen und bei drohendem Anschlussverlust direkt JR-Personal ansprechen.',
          'Beide Papierfahrkarten und den Klook-Voucher bereithalten; neue Zug- und Sitzplatzberechtigung vor dem Einstieg bestätigen lassen.'
        ],
        jp:'ひだ8号が遅れています。名古屋駅でのぞみ71号に乗り換えられるか、確認していただけますか？乗り遅れる場合、どうすればよいですか？'
      },
      missed:{
        title:'Anschluss Nozomi 71 verpasst',
        steps:[
          'Am JR-Shinkansen-Schalter oder bei der Umsteigesperre Personal ansprechen; beide Papiertickets vorzeigen.',
          'Fragen, welchen späteren Zug du mit genau diesen Klook-Tickets nehmen darfst und ob ein neues Ticket nötig ist.',
          'Nicht ungeprüft einen anderen Nozomi nehmen oder die reservierten Plätze 8D/8E im nächsten Zug beanspruchen.'
        ],
        jp:'のぞみ71号に乗り遅れました。Klookで購入したこの切符で利用できる次の列車と、必要な手続きを教えてください。新しい切符は必要ですか？'
      },
      ticket:{
        title:'Ticketproblem am Automaten oder Gate',
        steps:[
          'Bei Abholproblemen in Takayama die bisherige JR-Schalterhilfe und den echten Klook-Voucher zeigen.',
          'Wenn die Umsteigesperre in Nagoya das Ticket ablehnt, den besetzten JR-Transfer-Schalter nutzen.',
          'Tickets nicht wegwerfen und nicht erneut kaufen, bevor das Personal die erforderlichen Schritte erklärt.'
        ],
        jp:'Klookの予約バウチャーがあります。切符の発券、または乗り換え改札で困っています。2人分の切符を確認して、手続き方法を教えていただけますか？'
      },
      staff:{
        title:'Personal nach dem richtigen Weg fragen',
        steps:[
          'Die Karte zusammen mit deinen Papiertickets beim JR-Personal vorzeigen.',
          'Am Bahnhof Nagoya den Schildern „新幹線“ (Shinkansen) und „のりかえ“ (Umsteigen) folgen.',
          'Das tatsächliche Gleis und die Abfahrt des Nozomi 71 auf der Bahnhofsanzeige abgleichen.'
        ],
        jp:'名古屋駅でのぞみ71号に乗り換えたいです。新幹線の乗り換え改札口とホームはどこですか？この切符で大丈夫ですか？'
      }
    };
    const selected=instructions[kind];
    let margin=null;
    let marginText='';
    if(kind==='delay'){
      if(delayMinutes===null){
        marginText='22 Minuten laut Fahrplan. Wenn du die Verspätung kennst, kannst du sie eingeben.';
      }else{
        margin=22-delayMinutes;
        marginText=margin>0
          ?'Rechnerisch noch '+margin+' Minuten Umsteigezeit (22 − '+delayMinutes+').'
          :margin===0
            ?'Rechnerisch 0 Minuten Umsteigezeit. Anschluss stark gefährdet.'
            :'Rechnerisch '+(-margin)+' Minuten nach geplanter Nozomi-Abfahrt. Kein Nachweis, dass der Anschluss tatsächlich verpasst ist.';
      }
    }
    const japanese='すみません。'+shared+selected.jp+
      (kind==='delay'&&delayMinutes!==null?' 現在、約'+delayMinutes+'分遅れています。':'');
    return {
      kind,title:selected.title,steps:selected.steps.slice(),
      japanese,delayMinutes:kind==='delay'?delayMinutes:null,
      remainingMinutes:kind==='delay'?margin:null,
      marginText,plannedTransferMinutes:22
    };
  }
  return Object.freeze({localDate,todaySuggestion,isPastTravelView,kyotoDepartureClock,stations,tasksFor,completed,choose,taskTimeState,taskBuckets,trainProblem});
});