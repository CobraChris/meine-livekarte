/* Central map camera contract for EVERY travel section and calendar day.
 * The camera mode is ephemeral UI state; GPS samples are never persisted.
 * No Leaflet dependency, network, navigation data or location access.
 */
(function(root){
  'use strict';
  const MODES=Object.freeze(['manual','gps-follow','day-goals','overview']);
  function create(initialMode='manual'){
    if(!MODES.includes(initialMode))throw new Error('Unbekannter Kartenmodus.');
    let mode=initialMode,programmaticMoves=0;
    return Object.freeze({
      get mode(){return mode;},
      isFollowing(){return mode==='gps-follow';},
      isProgrammatic(){return programmaticMoves>0;},
      transition(next){
        if(!MODES.includes(next))throw new Error('Unbekannter Kartenmodus.');
        const changed=next!==mode;
        mode=next;
        return changed;
      },
      move(next,action){
        if(!MODES.includes(next)||typeof action!=='function')
          throw new Error('Ungültige Kartenaktion.');
        mode=next;
        programmaticMoves++;
        try{return action();}
        finally{programmaticMoves--;}
      }
    });
  }
  const api={MODES,create};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteMapCamera=api;
})(globalThis);
