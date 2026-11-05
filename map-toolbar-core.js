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
const api=Object.freeze({build});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteMapToolbar=api;
})(globalThis);
