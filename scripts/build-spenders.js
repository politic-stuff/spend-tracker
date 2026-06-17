#!/usr/bin/env node
// Adds AdImpact RACE SUMMARY per-advertiser rosters to each race, and builds the
// spender→race dictionary used to match competitive-inbox emails to our field.
// Rosters captured 2026-06-17 from AdImpact RACE SUMMARY (authenticated). side: D/R/I.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const dataPath = path.join(dir, 'data.json');

const ROSTERS = {
  "CA-22-2026": [["CLF",7913475,"R"],["House Majority PAC",6094850,"D"],["American Action Network",2739550,"R"],["House Majority Forward",1490570,"D"],["Save My Care",1368651,"D"],["314 Action",1267143,"D"],["Villegas for CA-22",1157801,"D"],["Project 218",866788,"D"],["New Democrat Majority",681159,"D"],["Blue Dog Action PAC",599796,"D"],["DMFI PAC",586445,"D"]],
  "CA-4-2026": [["Jones for CA CD-04",3945117,"D"],["Thompson for CA CD-04",1948273,"D"],["Blue Dog Action PAC",1115859,"D"],["New Leadership Now",493246,"D"],["Article One PAC",104000,"D"],["Riehle for CA CD-04",5230,"R"],["National Association of Realtors",279,"D"]],
  "PA-7-2026": [["CLF",7758920,"R"],["House Majority PAC",6597380,"D"],["Stronger Together PA",1508717,"D"],["Lead Left PAC",1441427,"D"],["American Prosperity Alliance",994579,"R"],["Brooks for PA CD-07",541907,"D"],["Save My Care",502643,"D"],["House Majority Forward",482389,"D"],["Affordable PA",444131,"D"],["Crosswell for PA CD-07",420559,"D"],["Securing American Greatness",399608,"R"]],
  "PA-8-2026": [["House Majority PAC",3666795,"D"],["CLF",3561364,"R"],["Unrig Our Economy",2480098,"D"],["Affordable PA",1439982,"D"],["House Majority Forward",1317145,"D"],["Save My Care",848883,"D"],["American Prosperity Alliance",371039,"R"],["Securing American Greatness",254184,"R"],["American Action Network",252998,"R"],["NRDC Action Fund",126289,"D"],["Campaign for America First International Assistance",91644,"R"]],
  "NE-Sen-2026": [["Ricketts for NE Senate",1561031,"R"],["One Nation",1128861,"R"],["Osborn for NE Senate",428871,"I"],["Defending Our Values PAC",254097,"R"],["Fellowship PAC",202953,"R"],["Nebraska Appleseed Action Fund",27771,"D"],["Americans for Prosperity",2922,"R"],["Common Defense Action Fund",1076,"D"],["MomsRising Together",768,"D"],["NRSC",563,"R"],["Sixteen Thirty Fund",522,"D"]],
  "ME-Sen-2026": [["SLF PAC",28790892,"R"],["WinSenate",25225725,"D"],["Pine Tree Results PAC",24456958,"R"],["One Nation",22628247,"R"],["WFW Action Fund",16437704,"R"],["Platner for ME Senate",11908962,"D"],["Stronger America",7241164,"R"],["Majority Forward",7168038,"D"],["Unrig Our Economy",2642077,"D"],["Duty and Honor",2495422,"D"],["Mills for ME Senate",1974310,"D"]],
  "MI-Sen-2026": [["SLF PAC",25269160,"R"],["WinSenate",17020884,"D"],["Americans for Prosperity Action",9125027,"R"],["Center for Democratic Priorities",6524191,"D"],["Yes MI Action Committee",5346593,"D"],["United Democracy Project",5241146,"D"],["A Stronger Michigan",2821771,"D"],["Center Forward Committee",1905426,"D"],["McMorrow for MI Senate",1810492,"D"],["El-Sayed for MI Senate",1107437,"D"],["Fight for Michigan",874977,"D"]],
  "AK-Sen-2026": [["SLF PAC",7845849,"R"],["Last Frontier PAC",6834929,"R"],["WinSenate",6100372,"D"],["One Nation",4143009,"R"],["Majority Forward",3949736,"D"],["Peltola for AK Senate",2874660,"D"],["The 907 Initiative",1447442,"D"],["Last Frontier Action",1046105,"R"],["American Advancement Inc",799649,"R"],["Families Over Billionaires",542507,"D"],["Duty and Honor",323031,"D"]],
  "TX-Gov-2026": [["Abbott for TX Governor",6733974,"R"],["Hinojosa for TX Governor",627957,"D"],["Huffines for TX Comptroller",519999,"R"],["Texans for Greg Abbott",234000,"R"],["Cole for TX Governor",63195,"D"],["Preserve, Protect and Defend",9697,"D"],["Lone Star Project",6893,"D"],["Texas Majority PAC",6629,"D"],["Brooks for TX Governor",600,"R"],["Texas Federation of Teachers",392,"D"],["Project Red TX",382,"R"]],
  "NY-13-2026": [["BOLD America",1982591,"D"],["American Priorities",1014640,"D"],["Progressive Unity Fund",962986,"D"],["Avila Chevalier for NY CD-13",534599,"D"],["Project 218",452138,"D"],["Justice Democrats",390848,"D"],["Latino Victory Fund",289698,"D"],["Espaillat for NY CD-13",20188,"D"]],
  "NY-7-2026": [["Real Fight NYC",345005,"D"],["Valdez for NY CD-07",232126,"D"],["Reynoso for NY CD-07",105183,"D"],["Leaders We Deserve",56253,"D"],["American Priorities",50000,"D"],["Justice Democrats",34575,"D"],["Won for NY CD-07",24263,"D"]],
  "MI-13-2026": [["McKinney for MI CD-13",60119,"D"],["Thanedar for MI CD-13",50344,"D"],["Justice Democrats",370,"D"]],
};

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dict = {}; // normalized spender -> [{raceKey, side, amount, name}]
let rows = 0;

for (const [rk, list] of Object.entries(ROSTERS)) {
  if (!data.races[rk]) { console.log(`  ? unknown race ${rk}`); continue; }
  data.races[rk].spenders = list.map(([name, amount, side]) => ({ name, amount, side }));
  for (const [name, amount, side] of list) {
    (dict[norm(name)] = dict[norm(name)] || []).push({ raceKey: rk, side, amount, name });
    rows++;
  }
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
fs.writeFileSync(path.join(dir, 'spender-dictionary.json'), JSON.stringify(dict, null, 2));
require('./wrap.js');
const uniqueSpenders = Object.keys(dict).length;
console.log(`Added spender rosters to ${Object.keys(ROSTERS).length} races (${rows} rows); dictionary has ${uniqueSpenders} unique spenders.`);
