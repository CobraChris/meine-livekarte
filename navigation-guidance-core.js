/* Read-only navigation guidance derived from an EXISTING tour progress fix.
 * This never requests routing, reads GPS itself, stores tracks or auto-reroutes.
 */
(function(root){
'use strict';
function finitePositive(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0;}
function derive({progress,accuracy,fixAgeMs}={}){
 if(!progress||!finitePositive(fixAgeMs)||fixAgeMs>30000)
   return Object.freeze({kind:'waiting',message:'GPS-Position aktualisieren',canOfferReroute:false,
     distanceMeters:null,durationSeconds:null});
 if(!finitePositive(accuracy)||accuracy>75||['gps-imprecise','poor-gps'].includes(progress.status))
   return Object.freeze({kind:'uncertain',message:'GPS zu ungenau – Richtung vor Ort prüfen',
     canOfferReroute:false,distanceMeters:null,durationSeconds:null});
 const distance=finitePositive(progress.remainingMeters)?Math.round(progress.remainingMeters):null;
 const duration=finitePositive(progress.remainingSeconds)?Math.round(progress.remainingSeconds):null;
 if(progress.arrived===true)
   return Object.freeze({kind:'arrived',message:'Am nächsten Stopp angekommen',
     canOfferReroute:false,distanceMeters:distance,durationSeconds:duration});
 if(progress.offRoute===true)
   return Object.freeze({kind:'deviation',message:'Deutliche Abweichung vom Fußweg',
     canOfferReroute:true,distanceMeters:distance,durationSeconds:duration});
 if(progress.status==='near-goal')
   return Object.freeze({kind:'near',message:'Ziel in der Nähe',
     canOfferReroute:false,distanceMeters:distance,durationSeconds:duration});
 return Object.freeze({kind:'following',message:'Zum nächsten Stopp gehen',
   canOfferReroute:false,distanceMeters:distance,durationSeconds:duration});
}
const api=Object.freeze({derive});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteNavigationGuidance=api;
})(globalThis);
