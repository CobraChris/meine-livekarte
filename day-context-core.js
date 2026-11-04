/* One read-only source of the current travel section, calendar day, and
 * route-preview goals. All tabs and map providers consume the same result.
 * No browser APIs, GPS, network or persistence. Plan/day configurations
 * remain in MapCore + multi-day-core, not hardcoded per destination.
 */
(function(root){
  'use strict';
  function resolve({
    planId,day,plan,journey=null,places=[],assignments={},
    dayAssignments={},placeKey,placesForPlan,calendar,distance
  }){
    if(typeof planId!=='string'||typeof placeKey!=='function'||
       typeof placesForPlan!=='function'||!calendar||
       typeof distance!=='function'||!Array.isArray(places))
      throw new Error('Ungültiger Reiseabschnitt-Kontext.');
    const days=calendar.days(planId);
    const effectiveDay=days.length&&calendar.allowed(planId,day)
      ?day:calendar.ALL;
    const dated=days.includes(effectiveDay);
    const planPlaces=placesForPlan(places,assignments,planId);
    const visiblePlaces=days.length
      ?calendar.selected(planPlaces,dayAssignments,effectiveDay,placeKey)
      :planPlaces.slice();
    const displayGoals=visiblePlaces.filter(p=>p.category!=='hotel');
    const mapFocusPlaces=dated&&displayGoals.length
      ?displayGoals:visiblePlaces.slice();
    // First planned location anchors the visit order; the existing
    // straight-line optimizer does not claim walking or rail directions.
    const orderedStops=dated
      ?calendar.optimizeDayOrder(displayGoals,distance):[];
    const counts=Object.create(null);
    if(days.length){
      const goals=planPlaces.filter(p=>p.category!=='hotel');
      counts[calendar.ALL]=goals.length;
      counts[calendar.UNASSIGNED]=0;
      for(const d of days)counts[d]=0;
      for(const p of goals){
        const d=dayAssignments[placeKey(p)];
        if(days.includes(d))counts[d]++;
        else counts[calendar.UNASSIGNED]++;
      }
    }
    const keyForRoute=stops=>effectiveDay+'|'+stops.map(placeKey).join('|');
    const tourKey=dated?planId+'@'+effectiveDay:planId;
    return Object.freeze({
      planId,plan,journey,day:effectiveDay,days:Object.freeze([...days]),
      isDated:dated,dayLabel:calendar.dayLabel(effectiveDay),
      planPlaces:Object.freeze([...planPlaces]),
      visiblePlaces:Object.freeze([...visiblePlaces]),
      displayGoals:Object.freeze([...displayGoals]),
      mapFocusPlaces:Object.freeze([...mapFocusPlaces]),
      orderedStops:Object.freeze([...orderedStops]),
      counts:Object.freeze(counts),tourKey,routeKey:keyForRoute,
      routeType:journey?'rail':dated?'day-visit':'places'
    });
  }
  const api={resolve};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteDayContext=api;
})(globalThis);
