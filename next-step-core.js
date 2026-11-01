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
    task('kyoto:hotel','ab ca. 15:15','Zum Tomoya Residence',
      'Ab Kyoto Station Taxi oder Karasuma-Linie bis Karasuma Oike und etwa 7 Minuten Fußweg.',stations.hotel,'manual','city'),
    task('kyoto:gion','nach Check-in','Gion Shirakawa besuchen',
      'Gemütlicher Abendspaziergang mit Tatsumi-Brücke; Zeiten flexibel.',stations.gion,'manual','city'),
    task('kyoto:ponto','abends','In Ponto-chō essen',
      'Restaurantgasse am Kamo-Fluss; keine Reservierung hinterlegt.',stations.ponto,'manual','city')
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
      return travelTasks().filter(t=>['kyoto:hotel','kyoto:gion','kyoto:ponto'].includes(t.id));
    }
    if(dateKey===KYOTO_DAY2)return kyotoDay2();
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
    const delayMinutes=/^\\d{1,3}$/.test(input)&&Number(input)<=180?
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
  return Object.freeze({localDate,kyotoDepartureClock,stations,tasksFor,completed,choose,trainProblem});
});