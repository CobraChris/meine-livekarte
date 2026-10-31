/* Verified Japanese destination labels for the user's mapped Kyoto itinerary.
 * Hotel name, address and phone: official tomoyaresidencehotel.net Japanese page.
 * Other stops: Japanese place NAME ONLY (no fabricated street address).
 * No external requests, keys, location access or persistence.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.JapaneseDestination=api;
})(typeof window!=='undefined'?window:undefined,function(){
  const DESTINATIONS=[
    {match:/tomoya residence|トモヤレジデンス/i,
     lat:35.0137,lng:135.76181,
     name:'トモヤレジデンスホテル 京都 二条高倉',
     address:'〒604-0831 京都市中京区二条通高倉西入松屋町58',
     phone:'075-211-8050',
     source:'https://www.tomoyaresidencehotel.net/',
     label:'Tomoya Residence Hotel Kyoto Nijo Takakura'},
    {match:/^kyoto station$|^京都駅$/i,lat:34.98535,lng:135.75877,
     name:'京都駅',label:'Kyoto Station'},
    {match:/^karasuma oike station$|^烏丸御池駅$/i,
     lat:35.01082,lng:135.75965,name:'烏丸御池駅',
     label:'Karasuma Oike Station'},
    {match:/^gion shirakawa|祇園白川/i,lat:35.0054743,lng:135.7736461,
     name:'祇園白川',label:'Gion Shirakawa'},
    {match:/^tatsumi.brücke|巽橋/i,lat:35.005692,lng:135.774582,
     name:'巽橋',label:'Tatsumi-Brücke (Gion)'},
    {match:/^ponto.chō|^ponto.cho|^先斗町/i,lat:35.00613,lng:135.77109,
     name:'先斗町',label:'Ponto-chō'},
    {match:/^kiyomizu.dera|^清水寺/i,lat:34.994722,lng:135.783056,
     name:'清水寺',label:'Kiyomizu-dera'},
    {match:/^sannenzaka|^産寧坂/i,lat:34.9973,lng:135.781,
     name:'産寧坂・二寧坂',label:'Sannenzaka / Ninenzaka'},
    {match:/^fushimi inari|^伏見稲荷/i,lat:34.967125,lng:135.773108,
     name:'伏見稲荷大社',label:'Fushimi Inari-Taisha'}
  ];
  function get(place){
    if(!place||typeof place.name!=='string'||typeof place.lat!=='number'||
       typeof place.lng!=='number'||!Number.isFinite(place.lat)||
       !Number.isFinite(place.lng))return null;
    const destination=DESTINATIONS.find(item=>
      item.match.test(place.name)&&
      Math.abs(item.lat-place.lat)<=0.0015&&
      Math.abs(item.lng-place.lng)<=0.0015);
    if(!destination)return null;
    const {match,...copy}=destination;
    return {...copy,lat:place.lat,lng:place.lng};
  }
  function driverText(dest){
    if(!dest||!dest.name)return '';
    return ['こちらまでお願いします。',dest.name,
      ...(dest.address?[dest.address]:[]),
      ...(dest.phone?['電話：'+dest.phone]:[])].join('\n');
  }
  function googleMapsLink(dest){
    if(!dest||!Number.isFinite(dest.lat)||!Number.isFinite(dest.lng))return '';
    return 'https://www.google.com/maps/search/?api=1&query='+
      encodeURIComponent(dest.lat+','+dest.lng);
  }
  return Object.freeze({get,driverText,googleMapsLink});
});