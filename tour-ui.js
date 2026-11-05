/* Shared tour-builder presentation for every travel section and calendar day.
 * Owns only DOM rendering and user-initiated control events. It never sees GPS
 * coordinates, calls the network, accesses browser storage or persists routes.
 *
 * All changes to tour selection / day preferences go through the app callbacks:
 * app.js retains the one canonical route, day state and persistence workflow.
 */
(function(root){
'use strict';
function create({document,dayPlanCore,walkingCore,handlers}){
  if(!document||!handlers||typeof handlers.selectMapMode!=='function'||
     typeof handlers.setSelection!=='function'||typeof handlers.dayStopMinutes!=='function')
    throw new Error('Touren-UI benötigt Dokument und Aktionen.');
  const $=id=>document.getElementById(id);
  const node=(tag,text,cls)=>{
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=text;
    if(cls)el.className=cls;
    return el;
  };
  const builder=$('tour-builder'),status=$('tour-builder-status');
  const stopsList=$('tour-stops'),daySettings=$('day-stop-settings');
  const mapMode=$('tour-map-mode'),mapCounter=$('tour-map-counter'),
    mapDone=$('tour-map-done'),mapPick=$('tour-pick-on-map');

  function renderMapControls({picking,count}){
    mapMode.setAttribute('aria-pressed',String(picking));
    mapMode.textContent=picking?'✓ Tour auswählen':'＋ Tour auf Karte';
    mapMode.title=picking
      ?'Auswahlmodus beenden – markierte Kartenpins zur Tour hinzufügen oder entfernen'
      :'Markierungen direkt antippen und sofort zur Tour hinzufügen';
    mapCounter.hidden=!picking;
    mapDone.hidden=!picking;
    mapCounter.textContent=count+'/6 Ziele · '+
      (count===6?'Maximum erreicht':'Kartenpins antippen');
    mapDone.textContent='Fertig'+(count?' · '+count:'');
    mapPick.textContent=picking?'✓ Kartenauswahl aktiv':'📍 Orte direkt auf Karte auswählen';
    mapPick.setAttribute('aria-pressed',String(picking));
  }

  function renderTourBuilder({selected,calculating,hasRoute}){
    $('tour-count').textContent=selected.length+'/6 Ziele';
    stopsList.replaceChildren();
    if(!selected.length)
      stopsList.append(node('li','Noch keine Ziele ausgewählt.','tour-empty'));
    selected.forEach((place,index)=>{
      const li=node('li',undefined,'tour-stop');
      li.append(node('span',String(index+1),'tour-stop-number'));
      const name=node('span',place.name,'tour-stop-name');
      if(place.duration)name.append(node('small','Besuch: '+place.duration));
      li.append(name);
      const controls=node('div',undefined,'tour-stop-controls');
      for(const [label,direction] of [['↑',-1],['↓',1]]){
        const btn=node('button',label);
        btn.type='button';
        btn.setAttribute('aria-label',place.name+' '+(direction<0?'nach oben':'nach unten'));
        btn.disabled=index+direction<0||index+direction>=selected.length;
        btn.onclick=()=>{
          const reordered=selected.slice(),other=index+direction;
          [reordered[index],reordered[other]]=[reordered[other],reordered[index]];
          handlers.setSelection(reordered);
          builder.open=true;
          status.textContent='Reihenfolge angepasst. Rundgang neu berechnen.';
        };
        controls.append(btn);
      }
      const remove=node('button','×');
      remove.type='button';
      remove.setAttribute('aria-label',place.name+' aus Rundgang entfernen');
      remove.onclick=()=>handlers.removeStop(place);
      controls.append(remove);
      li.append(controls);
      stopsList.append(li);
    });
    $('tour-calculate').disabled=selected.length<2||!!calculating;
    $('tour-clear').disabled=!selected.length;
    $('tour-optimize').disabled=selected.length<2||!!calculating;
    if(!selected.length&&!hasRoute)
      status.textContent='Wähle zunächst zwei bis sechs Orte über „＋ Tour“.';
  }

  function renderDayControls({prefs,stops,stopPrefs,visitMinutes}){
    if(!dayPlanCore)return;
    $('day-start').value=prefs.start;
    $('day-buffer').value=String(prefs.buffer);
    $('day-lunch').value=String(prefs.lunch);
    daySettings.replaceChildren();
    stops.forEach((place,i)=>{
      const settings=stopPrefs(place);
      const row=node('div',undefined,'day-stop-row');
      const title=node('strong',(i+1)+'. '+place.name);
      const fields=node('div',undefined,'day-stop-fields');
      const createField=(caption,type,value,onchange)=>{
        const label=node('label',caption),input=node('input');
        input.type=type;
        input.value=value;
        if(type==='number'){
          input.min='5';input.max='480';input.step='5';
          input.inputMode='numeric';
        }
        input.onchange=()=>onchange(input.value);
        label.append(input);
        fields.append(label);
      };
      const known=dayPlanCore.visitMinutes(place.duration);
      createField('Besuch (Min.)','number',String(visitMinutes(place)),
        value=>handlers.setVisitMinutes(place,value));
      createField('Öffnet','time',settings.open||'',
        value=>handlers.setOpening(place,value));
      createField('Schließt','time',settings.close||'',
        value=>handlers.setClosing(place,value));
      row.append(title);
      row.append(node('small',known===null
        ?'45 Min. als Schätzung vorbelegt – bitte anpassen.'
        :'Übernommen aus Besuchsdauer: '+place.duration+'. Mittelwert bei Zeitspanne.'));
      row.append(fields);
      daySettings.append(row);
    });
  }

  function renderCalculatedTour({ordered,result}){
    // Render already validated OSRM metrics; no network or GPS in this module.
    const summary=walkingCore.distanceText(result.distance)+' · ca. '+
      walkingCore.durationText(result.duration)+' zu Fuß';
    $('tour-route-title').textContent='🚶 Rundgang · '+ordered.length+' Ziele';
    $('tour-route-metrics').textContent=summary;
    $('tour-route-note').textContent=
      'Start am GPS-Punkt bei Berechnung · keine automatische Aktualisierung';
    $('tour-route-hud').hidden=false;
    $('tour-result-summary').textContent=summary;
    const legs=$('tour-result-legs');
    legs.replaceChildren();
    result.legs.forEach((leg,i)=>{
      const label=(i?'Stopp '+i:'Standort')+' → '+ordered[i].name+
        ': '+walkingCore.distanceText(leg.distance)+' · '+
        walkingCore.durationText(leg.duration);
      legs.append(node('li',label));
    });
    $('tour-result').hidden=false;
  }

  function showDayPlanMissing(){
    $('day-plan-output').hidden=true;
    $('day-plan-state').textContent='Route fehlt';
    $('day-plan-alert').textContent=
      'Bitte zuerst den Rundgang berechnen oder optimieren. Ohne echte Gehzeiten ist kein belastbarer Tagesplan möglich.';
  }
  function showDayPlanError(error){
    $('day-plan-output').hidden=true;
    $('day-plan-state').textContent='Angaben prüfen';
    $('day-plan-alert').textContent=error?.message||'Tagesplan konnte nicht berechnet werden.';
  }
  function renderDaySchedule({schedule,pref,stopsCount}){
    const D=dayPlanCore,W=walkingCore;
    $('day-plan-output').hidden=false;
    const end=D.clockText(schedule.end);
    $('day-plan-state').textContent=D.clockText(schedule.start)+'–'+end;
    $('day-plan-summary').textContent='🗓 '+D.clockText(schedule.start)+' bis '+end+
      ' · '+schedule.walkingMinutes+' Min. Gehzeit · '+
      schedule.visitingMinutes+' Min. Besichtigung';
    const timeline=$('day-plan-timeline');
    timeline.replaceChildren();
    schedule.items.forEach(item=>{
      const li=node('li',undefined,'day-timeline-item');
      const heading=node('strong','Stopp '+item.index+' · '+item.name);
      const walking=node('p',D.clockText(item.depart)+'–'+D.clockText(item.arrival)+
        ' 🚶 Fußweg '+W.distanceText(item.legMeters)+' · '+item.legMinutes+' Min.');
      const visit=node('p',D.clockText(item.visitStart)+'–'+D.clockText(item.visitEnd)+
        ' 🏛 Besichtigung '+item.visitMinutes+' Min.');
      li.append(heading,walking);
      if(item.wait)li.append(node('p','⏳ '+item.wait+
        ' Min. bis zur eingetragenen Öffnungszeit warten','day-wait'));
      li.append(visit);
      if(item.hoursKnown)
        li.append(node('small','Öffnungsfenster (deine Eingabe): '+
          D.clockText(item.opening)+'–'+D.clockText(item.closing)));
      else li.append(node('small','Öffnungszeiten nicht hinterlegt – vor Ort prüfen.'));
      if(item.windowWarning)li.append(node('p','⚠ '+item.windowWarning,'day-warning'));
      if(item.schedule)li.append(node('small','🗓 Hinweis: '+item.schedule));
      if(item.note)li.append(node('small','💡 '+item.note));
      if(item.lunchAfter)li.append(node('p','🍽 '+item.lunchAfter+
        ' Min. Mittagspause nach diesem Stopp'));
      if(item.bufferAfter)li.append(node('p','＋ '+item.bufferAfter+
        ' Min. Zeitpuffer nach diesem Stopp'));
      timeline.append(li);
    });
    const warnings=$('day-plan-warnings');
    warnings.replaceChildren();
    if(schedule.unknownHours)
      warnings.append(node('p','⚠ Für '+schedule.unknownHours+
        ' von '+stopsCount+' Zielen sind keine Öffnungszeiten eingetragen.','day-warning'));
    if(pref.lunch>0&&!schedule.lunchScheduled)
      warnings.append(node('p','Hinweis: Die Mittagspause passt nicht nach einem Stopp ins Zeitfenster 11:30–14:30.','day-warning'));
    for(const message of schedule.warnings)
      warnings.append(node('p','⚠ '+message,'day-warning'));
    $('day-plan-alert').textContent=
      'Zeitplan mit echten Fußwegetappen erstellt · alle Zeiten sind Schätzwerte.';
  }

  function bind(){
    mapMode.onclick=()=>handlers.selectMapMode();
    mapPick.onclick=()=>handlers.selectMapPick();
    mapDone.onclick=()=>{
      handlers.finishMapPick();
      builder.open=true;
      const number=handlers.selectedCount();
      status.textContent=number>=2
        ?number+' Ziele gewählt. Jetzt Route optimieren oder Rundgang berechnen.'
        :'Bitte mindestens zwei Ziele auf der Karte auswählen.';
      builder.scrollIntoView({behavior:'smooth',block:'start'});
    };
    $('tour-clear').onclick=()=>{
      handlers.setSelection([]);
      status.textContent='Auswahl geleert. Deine gespeicherten Orte bleiben erhalten.';
    };
    $('tour-optimize').onclick=()=>handlers.calculate(true);
    $('tour-calculate').onclick=()=>handlers.calculate(false);
    $('day-start').onchange=()=>handlers.setStart($('day-start').value);
    $('day-buffer').onchange=()=>handlers.setBuffer($('day-buffer').value);
    $('day-lunch').onchange=()=>handlers.setLunch($('day-lunch').value);
    $('day-plan-refresh').onclick=()=>handlers.refreshDayPlan();
  }

  return {bind,renderMapControls,renderTourBuilder,renderDayControls,
    renderCalculatedTour,showDayPlanMissing,showDayPlanError,renderDaySchedule};
}
const api={create};
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteTourUI=api;
})(globalThis);
