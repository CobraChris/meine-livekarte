/* Single declarative contract for the future shared map action rail.
 * Pure state -> button labels. No DOM, GPS watcher, storage or navigation.
 */
(function(root){
'use strict';
function build({kind='all',gpsOn=false,gpsFix=false,cameraMode='manual',expanded=false}={}){
 const goalLabel=kind==='journey'?'Route zeigen':
   kind==='city'?'Ziele zeigen':'Alle Orte';
 const gpsLabel=!gpsOn?'Mein Standort · GPS einschalten':
   !gpsFix?'Mein Standort · GPS wird ermittelt':
   cameraMode==='gps-follow'?'Meinem Standort folgen':'Auf meinen Standort zentrieren';
 const actions=[
   {id:'expand-map',action:'toggle-fullscreen',
    label:expanded?'Karten-Vollbild beenden':'Karte im Vollbild anzeigen',pressed:expanded},
   {id:'fit',action:'show-goals',label:goalLabel,pressed:false},
   {id:'gps',action:'show-gps',label:gpsLabel,
    pressed:!!gpsOn&&!!gpsFix&&cameraMode==='gps-follow'}
 ];
 return Object.freeze(actions.map(action=>Object.freeze(action)));
}
function describe({gpsOn=false,gpsFix=false,cameraMode='manual'}={}){
 if(!gpsOn)return 'GPS ausgeschaltet. Karte manuell verschiebbar.';
 if(!gpsFix)return 'GPS aktiv. Standort wird ermittelt.';
 if(cameraMode==='gps-follow')
   return 'GPS folgt deinem Standort. Verschieben der Karte pausiert das Folgen.';
 if(cameraMode==='day-goals')
   return 'Tagesziele im Blick. GPS bleibt aktiv, automatisches Folgen pausiert.';
 if(cameraMode==='overview')
   return 'Standort und Ziele im Blick. Für automatisches Folgen den Standortknopf drücken.';
 return 'GPS aktiv. Karte manuell verschoben. Für automatisches Folgen den Standortknopf drücken.';
}
const api=Object.freeze({build,describe});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteMapToolbar=api;
})(globalThis);
