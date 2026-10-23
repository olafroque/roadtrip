import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { firebaseConfig, MAPS_KEY } from "./config.js?v=202610221749";

/* ===================== helpers ===================== */
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  for (const k in (attrs||{})) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const TZ = "America/Los_Angeles";
const OFF = "-08:00"; // Thanksgiving week is in PST
const T = s => Date.parse(s.length === 16 ? s + ":00" + OFF : s);
const fmtDT = new Intl.DateTimeFormat("en-US",{timeZone:TZ,weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const fmtT = new Intl.DateTimeFormat("en-US",{timeZone:TZ,hour:"numeric",minute:"2-digit"});
const fmtDay = new Intl.DateTimeFormat("en-US",{timeZone:TZ,weekday:"short",month:"short",day:"numeric"});
const fmtWd = new Intl.DateTimeFormat("en-US",{timeZone:TZ,weekday:"short"});
const dayKey = t => new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(t);
const dayName = k => fmtDay.format(T(k + "T12:00"));
function hav(a, b){
  const R = 3958.8, r = Math.PI/180;
  const dLa = (b[1]-a[1])*r, dLo = (b[0]-a[0])*r;
  const x = Math.sin(dLa/2)**2 + Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
const miles = m => m < 0.2 ? "here" : (m < 10 ? m.toFixed(1) : Math.round(m)) + " mi";
const hrs = s => { const m = Math.round(s/60); return Math.floor(m/60) + " h " + String(m%60).padStart(2,"0") + " min"; };
const ROAD = 1.25;  // straight-line x 1.25 = typical road distance
const SLOW = 1.15;  // TomTom drive time + ~15% for stops

const KINDS = {
  food:   {label:"Food", d:"M7 2v9a2 2 0 0 0 2 2v9h2v-9a2 2 0 0 0 2-2V2h-1.5v7h-1V2h-1.5v7h-1V2zM17 2c-1.7 0-3 2.2-3 5v6h2v9h2V2z"},
  sight:  {label:"Landmark", d:"M12 3 3 8v2h18V8zM5 11v7h2v-7zm4 0v7h2v-7zm4 0v7h2v-7zm4 0v7h2v-7zM3 19v2h18v-2z"},
  kids:   {label:"Kids", d:"M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-4 8h8l1 6h-2l-.5 6h-5L9 16H7z"},
  nature: {label:"Outdoors", d:"M14 6 9 13l3 4H2zm-2.5 7.2L14 9.8 22 17h-8.3z"},
  stop:   {label:"Pit stop", d:"M5 3h9v18H5zm2 2v5h5V5zm9 3 3 3v7a2 2 0 0 1-4 0v-4h-1v-2h2v6a.5.5 0 0 0 1 0v-6.6L15 9z"},
  stay:   {label:"Lodging", d:"M3 11 12 4l9 7v9h-6v-6H9v6H3z"}
};
const HOUSE = "M3 11 12 4l9 7v9h-6v-6H9v6H3z";
const CARP = "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4h-2v2h-3v-2H8v2H5v-2H3v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1-3.2a1 1 0 0 0-1-.8H9.2a1 1 0 0 0-1 .8zM6.5 15a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zm11 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z";
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;

/* SVG data URLs for map billboards */
function pinImage(kind, color, hollow, size = 64){
  const k = KINDS[kind] || KINDS.sight;
  const bg = hollow ? "#ffffff" : color, fg = hollow ? color : "#ffffff";
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="27" fill="${bg}" stroke="${hollow ? color : "#ffffff"}" stroke-width="${hollow ? 6 : 4}"/>
    <g transform="translate(16 16) scale(1.33)"><path fill="${fg}" d="${k.d}"/></g></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}
function carImage(color){
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
    <circle cx="36" cy="36" r="33" fill="${color}" opacity=".28"/><circle cx="36" cy="36" r="24" fill="${color}" stroke="#ffffff" stroke-width="4"/>
    <g transform="translate(20 20) scale(1.33)"><path fill="#ffffff" d="${CARP}"/></g></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}

/* ===================== state ===================== */
let TRIP = null;            // trip/main document
let places = [];
let t = 0, START = 0, END = 0, DAYS = [];
let selId = null, tab = "places", fStatus = "all", fWho = "all", fKind = "all", groupBy = "city";
try { groupBy = localStorage.getItem("groupBy") || "city"; } catch {}
let playing = false, ride = false, dropFor = null, draft = null;
let me = {uid:null, name:""};

const G = () => TRIP.groups;
const STAYS = () => TRIP.stays;
const PLAN = () => TRIP.plan;
const DRIVES = () => TRIP.drives;
const gcol = g => tok(G()[g]?.color || "--both");
const forGroup = (p, g) => p.who === "both" || p.who === g;
const placeStart = p => p.day ? T(p.day + "T" + (p.time || "12:00")) : null;

/* ===================== Firebase ===================== */
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

/* ===================== routes & car positions ===================== */
const RT = {};
function buildRoutes(){
  for (const k in TRIP.routes) {
    const f = TRIP.routes[k], pts = [];
    for (let i=0;i<f.length;i+=2) pts.push([f[i], f[i+1]]);
    const cum = [0];
    for (let i=1;i<pts.length;i++) cum.push(cum[i-1] + hav(pts[i-1], pts[i]));
    RT[k] = {pts, cum, len:cum[cum.length-1]};
  }
}
function along(key, frac, rev){
  const r = RT[key]; let f = Math.min(1, Math.max(0, frac)); if (rev) f = 1 - f;
  const target = f * r.len; let i = 1;
  while (i < r.cum.length-1 && r.cum[i] < target) i++;
  const a = r.pts[i-1], b = r.pts[i], seg = (r.cum[i]-r.cum[i-1]) || 1, u = (target - r.cum[i-1]) / seg;
  let br = Math.atan2((b[0]-a[0]) * Math.cos(a[1]*Math.PI/180), b[1]-a[1]); if (rev) br += Math.PI;
  return {ll:[a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u], left:(1-f)*r.len, bearing:br};
}
const lastBearing = {family:0, friends:0};
function carAt(g, tm){
  for (const p of places) {
    if (p.status !== "confirmed" || !p.day || !p.time || p.lng == null || !forGroup(p, g)) continue;
    const s = placeStart(p), e = s + (p.dur || 120) * 60000;
    if (tm >= s && tm <= e) return {ll:[p.lng,p.lat], mode:"place", text:"At " + p.name, bearing:lastBearing[g]};
  }
  const plan = PLAN()[g];
  for (let i=0;i<plan.length;i++) {
    const s = plan[i]; if (!s.drive) continue;
    const d = DRIVES()[s.drive], at = T(s.at), dur = d.sec*SLOW*1000;
    if (tm < at) { const st = STAYS()[plan[i-1].stay]; return {ll:st.ll, mode:"stay", text:"At " + (st.short||st.name), bearing:lastBearing[g]}; }
    if (tm <= at + dur) {
      const a = along(d.route, (tm - at)/dur, d.rev); lastBearing[g] = a.bearing;
      return {ll:a.ll, mode:"drive", bearing:a.bearing, text:"Driving " + d.road + " · " + Math.round(a.left) + " mi to " + (STAYS()[s.to].short||STAYS()[s.to].name)};
    }
  }
  const st = STAYS()[plan[plan.length-1].stay];
  return {ll:st.ll, mode:"stay", text:"Home", bearing:lastBearing[g]};
}
function stayOn(g, tm){
  const plan = PLAN()[g]; let cur = plan[0].stay;
  for (const s of plan) if (s.drive && tm >= T(s.at)) cur = s.to;
  return cur;
}

/* ===================== Cesium map ===================== */
let viewer = null, tileset = null, tilesetTried = false;
const ents = {cars:{}, pins:new Map(), models:new Map(), routes:[], stays:[]};
const C = () => window.Cesium;
const LOW = matchMedia("(max-width: 820px), (pointer: coarse)").matches;
let mode = "board";
try { if (localStorage.getItem("mapMode") === "3d" && MAPS_KEY) mode = "3d"; } catch {}

async function initMap(){
  if (!window.Cesium) { banner("The map didn't load. Reload the page."); return; }
  const Cesium = C();
  viewer = new Cesium.Viewer("map", {
    baseLayer:false, baseLayerPicker:false, geocoder:false, homeButton:false, sceneModePicker:false,
    navigationHelpButton:false, animation:false, timeline:false, fullscreenButton:false,
    infoBox:false, selectionIndicator:false,
    requestRenderMode:true, maximumRenderTimeChange:Infinity   // only redraw when something changes
  });
  // Keep the camera over California so it never streams tiles for the rest of the world.
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 750000;
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
  viewer.camera.moveEnd.addEventListener(() => {
    const c = Cesium.Cartographic.fromCartesian(viewer.camera.position);
    const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
    const cl = [Math.min(-113.8, Math.max(-125.2, lon)), Math.min(42.3, Math.max(31.0, lat))];
    if (Math.abs(cl[0]-lon) > 0.01 || Math.abs(cl[1]-lat) > 0.01)
      viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(cl[0], cl[1], Math.min(c.height, 700000)),
        orientation:{heading:viewer.camera.heading, pitch:viewer.camera.pitch, roll:0}, duration:0.8});
    rescaleModels(false);
  });
  viewer.camera.percentageChanged = 0.1;
  viewer.camera.changed.addEventListener(() => rescaleModels(false));
  // Board map: free street map with labels (OpenStreetMap). No Google usage.
  const g = viewer.scene.globe;
  g.baseColor = Cesium.Color.fromCssColorString("#aad3df");
  g.showGroundAtmosphere = false;
  g.enableLighting = false;
  // OpenStreetMap's standard tiles: free, no key, street names and business labels.
  const osm = viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({url:"https://tile.openstreetmap.org/", maximumLevel:19}));
  // softer "board" look: calmer colors so the pieces stand out
  osm.saturation = 0.55; osm.brightness = 1.06; osm.contrast = 0.92; osm.gamma = 1.08;
  // fixed early-afternoon sun so shadows always fall the same way
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601("2026-11-22T21:00:00Z");
  viewer.clock.shouldAnimate = false;
  if (!LOW) {
    viewer.shadows = true;
    const sm = viewer.scene.shadowMap;
    sm.softShadows = true; sm.darkness = 0.45; sm.size = 2048; sm.maximumDistance = 60000;
    g.shadows = Cesium.ShadowMode.RECEIVE_ONLY;
  }
  const click = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  // Drop mode: treat a short press as a tap even if the mouse or finger moved a little.
  let downAt = null;
  click.setInputAction(ev => { downAt = Cesium.Cartesian2.clone(ev.position); }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
  click.setInputAction(ev => {
    if (!dropFor || !downAt) return;
    const moved = Cesium.Cartesian2.distance(downAt, ev.position); downAt = null;
    if (moved > 12) return; // that was a drag to move the map
    dropAt(ev.position);
  }, Cesium.ScreenSpaceEventType.LEFT_UP);
  click.setInputAction(ev => {
    if (dropFor) return;
    const picked = viewer.scene.pick(ev.position);
    const id = picked?.id?.properties?.placeId?.getValue();
    if (id) openPlace(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  $("#modeBtn").hidden = !MAPS_KEY;
  await setMode(mode);
  fitTrip(0);
}
async function ensureTileset(){
  if (tileset || tilesetTried) return tileset;
  tilesetTried = true;
  const Cesium = C();
  try {
    tileset = await Cesium.createGooglePhotorealistic3DTileset({key:MAPS_KEY, onlyUsingWithGoogleGeocoder:true}, {
      showCreditsOnScreen:true,
      maximumScreenSpaceError: LOW ? 32 : 20,     // less detail = fewer tiles; phones get the lighter setting
      dynamicScreenSpaceError:true, foveatedScreenSpaceError:true,
      cacheBytes: (LOW ? 256 : 768) * 1024 * 1024
    });
    const chip = $("#loading");
    tileset.loadProgress.addEventListener((pending, processing) => { chip.hidden = mode !== "3d" || pending + processing === 0; });
    tileset.allTilesLoaded.addEventListener(() => { chip.hidden = true; });
    viewer.scene.primitives.add(tileset);
  } catch (e) {
    tileset = null;
    banner("Google 3D didn't load (" + (e?.message || e) + "). Staying on the board map.");
  }
  return tileset;
}
async function setMode(m){
  if (m === "3d" && !(MAPS_KEY && await ensureTileset())) m = "board";
  mode = m;
  try { localStorage.setItem("mapMode", m); } catch {}
  if (tileset) tileset.show = m === "3d";
  viewer.scene.globe.show = m === "board";
  viewer.scene.skyAtmosphere.show = m === "3d";
  const b = $("#modeBtn"); b.textContent = m === "3d" ? "Board map" : "3D view"; b.setAttribute("aria-pressed", String(m === "3d"));
  if (m === "board") $("#loading").hidden = true;
  rescaleModels(true);
  viewer.scene.requestRender();
}
function banner(text){ const b = $("#banner"); b.textContent = text; b.hidden = !text; }
function fitTrip(dur = 1.5){
  if (!viewer) return;
  const Cesium = C();
  viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(-120.2, 33.0, 560000),
    orientation:{heading:Cesium.Math.toRadians(-20), pitch:Cesium.Math.toRadians(-62), roll:0}, duration:dur});
}
function flyTo(ll, range = 2500, dur = 1.4){
  if (!viewer) return;
  const Cesium = C();
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(ll[0], ll[1], 30), 60),
    {offset:new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-20), Cesium.Math.toRadians(-35), range), duration:dur});
}

/* routes */
function drawRoutes(){
  const Cesium = C();
  for (const e of ents.routes) viewer.entities.remove(e);
  ents.routes = [];
  const seen = new Set();
  for (const g of ["family","friends"]) {
    for (const s of PLAN()[g]) {
      if (!s.drive) continue;
      const d = DRIVES()[s.drive], key = g + ":" + d.route;
      if (seen.has(key)) continue; seen.add(key);
      const col = Cesium.Color.fromCssColorString(gcol(g));
      ents.routes.push(viewer.entities.add({polyline:{
        positions:Cesium.Cartesian3.fromDegreesArray(TRIP.routes[d.route]),
        width: g === "family" ? 8 : 5, clampToGround:true, zIndex: g === "family" ? 0 : 1,
        material: g === "family" ? col : new Cesium.PolylineDashMaterialProperty({color:col, dashLength:18})
      }}));
    }
  }
}

/* 3D game-piece models: parts in meters relative to the place point */
const MC = {green:"#2f9e44", greenD:"#21753a", red:"#e03131", redD:"#a61e1e", stone:"#ece6d8", stoneD:"#c9c0ab",
  bun:"#d9a35b", lettuce:"#63b84f", patty:"#6b3e26", cheese:"#f5c242", trunk:"#7a5230", pine:"#2b8a3e", pineL:"#3fa34d",
  white:"#f6f6f3", dark:"#3a3f3c", gray:"#8f9592"};
let U = 7, lastU = 0;               // meters per model unit; grows as the camera rises so pieces stay readable
const modelSpecs = new Map();      // key -> {kind, ll, accent, placeId}
function unitForCamera(){
  const hgt = viewer.camera.positionCartographic.height;
  return Math.min(600, Math.max(mode === "3d" ? 5 : 6, hgt / (mode === "3d" ? 450 : 260)));
}
function rescaleModels(force){
  if (!viewer) return;
  const u = unitForCamera();
  if (!force && lastU && Math.abs(u - lastU) / lastU < 0.15) return;
  U = u; lastU = u;
  for (const [key, s] of modelSpecs) buildModel(key, s);
  viewer.scene.requestRender();
}
/* Custom low-poly pieces for specific confirmed places (keyed by place id).
   Units: 1 = U meters. x = east, y = north, z = up (part center). h/pt/roll = heading/pitch/roll in degrees. */
const CB = (x,y,z,w,d,hgt,c,o={}) => ({t:"box", x,y,z, dim:[w,d,hgt], c, roll:o.roll||0, h:o.h||0, pt:o.pt||0});
const CC = (x,y,z,len,r,rt,c) => ({t:"cyl", x,y,z, len, r, rt:rt ?? r, c});
const CUSTOM = {
  // Monterey Bay Aquarium: old cannery hall, boiler stack, glass front, the bay with kelp and a whale tail
  aquarium: () => [
    CB(0.6,0,1.2, 6.2,4,2.4,"#e9dfc8"),
    CB(1.0,0,2.4, 5.4,2.83,2.83,"#7d8f99",{roll:45}),
    CB(-2.6,-0.3,1.9, 2.4,3.4,3.8,"#d9cdb2"), CB(-2.6,-0.3,3.87, 2.6,3.6,0.14,"#7d8f99"),
    CC(-3.2,1.1,3.9, 3.8,0.36,0.3,"#a0705a"), CC(-3.2,1.1,5.7, 0.25,0.42,0.42,"#2f3a40"),
    CB(1.2,-2.03,1.35, 4.4,0.08,0.9,"#8fd3f0"), CB(1.2,-2.05,0.5, 1.2,0.1,0.9,"#2f3a40"),
    CB(0,3.45,0.08, 9,2.6,0.16,"#3d8fc6"),
    CC(-2.6,3.6,0.6, 1.0,0.12,0.04,"#3f8f3a"), CC(-2.1,4.0,0.5, 0.8,0.1,0.04,"#4fa344"), CC(-3.1,4.1,0.45, 0.7,0.1,0.04,"#4fa344"),
    CC(2.6,3.6,0.45, 0.7,0.28,0.2,"#2d3e50"),
    CB(2.22,3.6,0.92, 0.9,0.35,0.12,"#2d3e50",{pt:28}), CB(2.98,3.6,0.92, 0.9,0.35,0.12,"#2d3e50",{pt:-28})
  ]
};
function partsFor(kind, accent, placeId){
  if (placeId && CUSTOM[placeId]) return CUSTOM[placeId]();
  const B = (x,y,z,w,d,hgt,c,roll) => ({t:"box", x,y,z, dim:[w,d,hgt], c, roll});
  const Cy = (x,y,z,len,r,rt,c) => ({t:"cyl", x,y,z, len, r, rt:rt ?? r, c});
  const roofSide = Math.SQRT2 * 1.6; // square rotated 45° spans 3.2 units wide, 1.6 tall
  switch (kind) {
    case "house": return [B(0,0,1.2,4,3,2.4,MC.green), B(0,0,2.4,4.3,roofSide,roofSide,MC.greenD,45), B(1.2,0.6,3.4,0.5,0.5,1.4,MC.greenD)];
    case "hotel": case "stay": return [B(0,0,1.5,7.2,3,3,MC.red), B(0,0,3.0,7.5,roofSide,roofSide,MC.redD,45)];
    case "food": return [Cy(0,0,0.3,0.6,1.8,1.8,MC.bun), Cy(0,0,0.65,0.2,1.95,1.95,MC.lettuce), Cy(0,0,1.0,0.5,1.85,1.85,MC.patty),
      B(0,0,1.32,3.3,3.3,0.15,MC.cheese), Cy(0,0,1.75,0.7,1.8,1.3,MC.bun), Cy(0,0,2.25,0.3,1.3,0.6,MC.bun)];
    case "kids": {
      const p = [Cy(0,0,0.2,0.4,2.3,2.3,accent), Cy(0,0,1.55,2.3,0.3,0.3,MC.white)];
      for (let i=0;i<8;i++){ const a = i*Math.PI/4; p.push(Cy(1.7*Math.cos(a),1.7*Math.sin(a),1.55,2.3,0.1,0.1,MC.white), B(1.7*Math.cos(a),1.7*Math.sin(a),1.25,0.6,0.3,0.5,i%2?MC.cheese:MC.white)); }
      p.push(Cy(0,0,3.3,1.2,2.5,0.2,accent), Cy(0,0,4.2,0.7,0.06,0.06,MC.dark));
      return p;
    }
    case "nature": return [Cy(0,0,0.5,1,0.4,0.4,MC.trunk), Cy(0,0,1.6,1.4,2.2,1.0,MC.pine), Cy(0,0,2.7,1.2,1.7,0.6,MC.pineL), Cy(0,0,3.7,1.1,1.2,0.05,MC.pine)];
    case "stop": return [B(0,0,0.1,2.6,1.8,0.2,MC.gray), B(0,0,1.6,1.8,1.2,2.8,accent), B(0,-0.65,2.25,1.2,0.1,0.7,MC.white), B(0,0,3.15,2,1.4,0.3,MC.dark), B(1.05,0,1.65,0.35,0.3,1.3,MC.dark)];
    default: { // landmark: columned building
      const p = [B(0,0,0.12,5.4,4.2,0.25,MC.stoneD), B(0,0,0.37,5,3.8,0.25,MC.stone), B(0,0,1.5,3.2,2,2,MC.stoneD)];
      for (const x of [-2.1,-1.05,0,1.05,2.1]) for (const y of [-1.55,1.55]) p.push(Cy(x,y,1.5,2,0.24,0.24,MC.stone));
      p.push(B(0,0,2.7,5.2,4,0.4,accent), B(0,0,2.9,5.2,Math.SQRT2*2,Math.SQRT2*2*0.45,MC.stone,45));
      return p;
    }
  }
}
function addModel(key, kind, ll, accent, placeId){
  modelSpecs.set(key, {kind, ll, accent, placeId});
  buildModel(key, modelSpecs.get(key));
}
function buildModel(key, s){
  const Cesium = C();
  const old = ents.models.get(key); if (old) for (const e of old) viewer.entities.remove(e);
  const list = [];
  const mLon = U / (111320*Math.cos(s.ll[1]*Math.PI/180)), mLat = U / 110540;
  const parts = partsFor(s.kind, s.accent, s.placeId).map(p => ({...p, z:p.z + 0.22}));
  // board-game stand: a cream disc with a colored rim under every piece
  let r = 0;
  for (const p of parts) r = Math.max(r, p.t === "box" ? Math.hypot(Math.abs(p.x) + p.dim[0]/2, Math.abs(p.y) + p.dim[1]/2) : Math.hypot(p.x, p.y) + p.r);
  r = Math.min(r + 0.35, 7);
  parts.unshift({t:"cyl", x:0,y:0,z:0.07, len:0.14, r:r+0.22, rt:r+0.22, c:s.accent || "#13603f"}, {t:"cyl", x:0,y:0,z:0.17, len:0.1, r, rt:r, c:"#f6f1e7"});
  const SH = Cesium.ShadowMode.CAST_ONLY;   // pieces cast soft shadows on the map; no self-shadow streaks
  for (const p of parts) {
    const pos = Cesium.Cartesian3.fromDegrees(s.ll[0] + p.x*mLon, s.ll[1] + p.y*mLat, p.z*U);
    const color = Cesium.Color.fromCssColorString(p.c);
    const base = {position:pos, properties:s.placeId ? {placeId:s.placeId} : undefined};
    if (p.t === "box") {
      if (p.roll || p.h || p.pt) base.orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(p.h||0), Cesium.Math.toRadians(p.pt||0), Cesium.Math.toRadians(p.roll||0)));
      base.box = {dimensions:new Cesium.Cartesian3(p.dim[0]*U, p.dim[1]*U, p.dim[2]*U), material:color, heightReference:Cesium.HeightReference.RELATIVE_TO_GROUND, shadows:SH};
    } else {
      base.cylinder = {length:p.len*U, topRadius:p.rt*U, bottomRadius:p.r*U, material:color, heightReference:Cesium.HeightReference.RELATIVE_TO_GROUND, slices:24, shadows:SH};
    }
    list.push(viewer.entities.add(base));
  }
  ents.models.set(key, list);
}
function removeModel(key){
  modelSpecs.delete(key);
  const l = ents.models.get(key); if (l) { for (const e of l) viewer.entities.remove(e); ents.models.delete(key); }
}

/* stays */
function drawStays(){
  const Cesium = C();
  for (const e of ents.stays) viewer.entities.remove(e);
  ents.stays = [];
  for (const k in STAYS()) {
    const s = STAYS()[k]; if (!s.model) continue;
    addModel("stay:" + k, s.model, s.ll, "#13603f");
    ents.stays.push(viewer.entities.add({position:Cesium.Cartesian3.fromDegrees(s.ll[0], s.ll[1]),
      label:{text:s.short || s.name, font:"700 14px Atkinson Hyperlegible, sans-serif", fillColor:Cesium.Color.WHITE, outlineColor:Cesium.Color.BLACK, outlineWidth:4,
        style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.TOP, pixelOffset:new Cesium.Cartesian2(0, 14),
        heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance:Number.POSITIVE_INFINITY,
        distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0, 25000),
        showBackground:true, backgroundColor:Cesium.Color.fromCssColorString("#13603f")}}));
  }
}

/* pins + confirmed models */
function syncPins(){
  if (!viewer || !TRIP) return;
  const Cesium = C();
  const seen = new Set();
  for (const p of places) {
    if (p.lng == null) continue;
    seen.add(p.id);
    const sig = [p.kind,p.who,p.status,p.lng,p.lat,p.name, p.id === selId].join("|");
    const cur = ents.pins.get(p.id);
    if (cur && cur.sig === sig) continue;
    if (cur) viewer.entities.remove(cur.e);
    const col = gcol(p.who);
    const atStay = Object.values(STAYS()).some(s => s.model && hav(s.ll, [p.lng,p.lat]) < 0.1);
    const e = viewer.entities.add({
      position:Cesium.Cartesian3.fromDegrees(p.lng, p.lat),
      properties:{placeId:p.id},
      billboard:(p.status === "confirmed" && !atStay) ? undefined : {image:pinImage(p.kind, col, p.status === "idea"), width:p.id === selId ? 44 : 34, height:p.id === selId ? 44 : 34,
        heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, verticalOrigin:Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance:Number.POSITIVE_INFINITY, pixelOffset:new Cesium.Cartesian2(0, -24)},
      label:atStay && p.id !== selId ? undefined : {text:p.name, font:"700 13px Atkinson Hyperlegible, sans-serif", fillColor:Cesium.Color.WHITE, outlineColor:Cesium.Color.BLACK, outlineWidth:3,
        style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, pixelOffset:new Cesium.Cartesian2(0, p.status === "confirmed" ? -12 : -48),
        heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance:Number.POSITIVE_INFINITY,
        distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0, p.id === selId ? 1e7 : p.status === "confirmed" ? 60000 : 12000)}
    });
    ents.pins.set(p.id, {e, sig});
    // 3D model for confirmed places (not when the plan is at a stay)
    if (p.status === "confirmed" && !atStay) addModel("place:" + p.id, p.kind, [p.lng,p.lat], col, p.id); else removeModel("place:" + p.id);
  }
  for (const [id, v] of ents.pins) if (!seen.has(id)) { viewer.entities.remove(v.e); ents.pins.delete(id); removeModel("place:" + id); }
}

/* cars: toy-car game pieces that turn with the road */
const CAR_PARTS = c => [
  {f:0, r:0, z:0.75, dim:[4.6,2.3,1.1], c},                 // body
  {f:-0.4, r:0, z:1.75, dim:[2.6,2.0,0.9], c:"#e8f1f6"},     // cabin
  {f:1.6, r:0.75, z:0.45, dim:[0.9,0.5,0.9], c:"#2b2f2d"}, {f:1.6, r:-0.75, z:0.45, dim:[0.9,0.5,0.9], c:"#2b2f2d"},
  {f:-1.6, r:0.75, z:0.45, dim:[0.9,0.5,0.9], c:"#2b2f2d"}, {f:-1.6, r:-0.75, z:0.45, dim:[0.9,0.5,0.9], c:"#2b2f2d"},
  {f:-0.4, r:0, z:2.35, dim:[0.8,0.8,0.3], c}               // roof light
];
function drawCars(){
  const Cesium = C();
  for (const g of ["friends","family"]) {
    for (const e of (ents.cars[g + ":parts"] || [])) viewer.entities.remove(e);
    if (ents.cars[g]) viewer.entities.remove(ents.cars[g]);
    const CU = () => Math.max(U * 2.2, 10);   // cars a bit oversized so they read as game tokens
    const parts = CAR_PARTS(gcol(g)).map(pt => {
      const posAt = () => {
        const c = carAt(g, t), b = c.bearing || 0, u = CU();
        const east = pt.f*u*Math.sin(b) + pt.r*u*Math.cos(b), north = pt.f*u*Math.cos(b) - pt.r*u*Math.sin(b);
        return Cesium.Cartesian3.fromDegrees(c.ll[0] + east / (111320*Math.cos(c.ll[1]*Math.PI/180)), c.ll[1] + north / 110540, pt.z*u);
      };
      return viewer.entities.add({
        position:new Cesium.CallbackProperty(posAt, false),
        orientation:new Cesium.CallbackProperty(() => Cesium.Transforms.headingPitchRollQuaternion(posAt(), new Cesium.HeadingPitchRoll((carAt(g, t).bearing || 0) - Math.PI/2, 0, 0)), false),
        box:{dimensions:new Cesium.CallbackProperty(() => new Cesium.Cartesian3(pt.dim[0]*CU(), pt.dim[1]*CU(), pt.dim[2]*CU()), false),
          material:Cesium.Color.fromCssColorString(pt.c), heightReference:Cesium.HeightReference.RELATIVE_TO_GROUND, shadows:Cesium.ShadowMode.CAST_ONLY}
      });
    });
    ents.cars[g + ":parts"] = parts;
    // label + camera target
    ents.cars[g] = viewer.entities.add({
      viewFrom:new Cesium.Cartesian3(-500, -1000, 700),
      position:new Cesium.CallbackProperty(() => { const c = carAt(g, t); return Cesium.Cartesian3.fromDegrees(c.ll[0], c.ll[1]); }, false),
      label:{text:G()[g].short, font:"700 12px Atkinson Hyperlegible, sans-serif", fillColor:Cesium.Color.WHITE, showBackground:true,
        backgroundColor:Cesium.Color.fromCssColorString(gcol(g)), pixelOffset:new Cesium.Cartesian2(0, -34),
        heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance:Number.POSITIVE_INFINITY}
    });
  }
}

/* ===================== timeline ===================== */
const frac = tm => (tm - START) / (END - START);
function tick(fromScrub){
  $("#clock").textContent = fmtDT.format(t);
  if (!fromScrub) $("#scrub").value = Math.round(frac(t) * 1000);
  const dk = dayKey(t);
  for (const b of $("#days").children) b.setAttribute("aria-current", String(b.dataset.day === dk));
  const cars = $("#cars"); cars.replaceChildren();
  for (const g of ["family","friends"]) {
    const c = carAt(g, t);
    cars.append(h("button",{class:"car-st", onclick:() => flyTo(c.ll, c.mode === "drive" ? 9000 : 2500)},
      h("i",{style:`background:var(${G()[g].color})`}), h("span",null, h("b",null, G()[g].label + ": "), c.text)));
  }
  if (viewer) viewer.scene.requestRender();
  if (tab === "place" && selId) renderDistances();
}
function buildDays(){
  const el = $("#days"); el.replaceChildren();
  for (const d of DAYS) {
    const tm = T(d + "T12:00");
    el.append(h("button",{"data-day":d, onclick:() => { t = T(d + "T09:00"); stopPlay(); tick(false); }}, h("span",null,fmtWd.format(tm)), h("b",null, d.slice(8))));
  }
}
$("#scrub").addEventListener("input", e => { t = START + (END - START) * e.target.value / 1000; tick(true); });
let raf = 0, last = 0;
const PLAY_ICON = svg("M7 4v16l13-8z"), PAUSE_ICON = svg("M6 4h4v16H6zm8 0h4v16h-4z");
function stopPlay(){ playing = false; cancelAnimationFrame(raf); $("#playBtn").innerHTML = PLAY_ICON; $("#playBtn").setAttribute("aria-label","Play the trip"); }
function startPlay(){
  if (t >= END - 60000) t = START;
  playing = true; $("#playBtn").innerHTML = PAUSE_ICON; $("#playBtn").setAttribute("aria-label","Pause");
  last = performance.now();
  const step = now => {
    const dt = Math.min(100, now - last); last = now;
    const driving = carAt("family", t).mode === "drive" || carAt("friends", t).mode === "drive";
    t += dt * (ride ? 12 : driving ? 40 : 160) * 1000;
    if (t >= END) { t = END; tick(false); stopPlay(); return; }
    tick(false); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
$("#playBtn").innerHTML = PLAY_ICON;
$("#playBtn").addEventListener("click", () => playing ? stopPlay() : startPlay());

/* map tools */
$("#rideBtn").onclick = e => {
  ride = !ride; e.currentTarget.setAttribute("aria-pressed", String(ride));
  if (!viewer) return;
  if (ride) { viewer.trackedEntity = ents.cars.family; banner("Riding along with our car. Press play to drive. Drag to look around."); }
  else { viewer.trackedEntity = undefined; banner(""); }
};
$("#modeBtn").onclick = () => { if (viewer) setMode(mode === "3d" ? "board" : "3d"); };
$("#fitBtn").onclick = () => { if (ride) $("#rideBtn").click(); fitTrip(); };
$("#hereBtn").onclick = () => { if (ride) $("#rideBtn").click(); flyTo(STAYS()[stayOn("family", t)].ll, 1800); };

/* ===================== panel ===================== */
function setTab(n){ tab = n; render(); }
$("#tabPlaces").onclick = () => { selId = null; setTab("places"); syncPins(); };
$("#tabAdd").onclick = () => { if (!draft) newDraft(); setTab("add"); };
$("#tabPlan").onclick = () => setTab("plan");
$("#sheetBtn").onclick = () => toggleSheet();
function toggleSheet(force){
  const p = $("#panel"); const open = force ?? !p.classList.contains("open");
  p.classList.toggle("open", open); $("#sheetBtn").setAttribute("aria-expanded", String(open)); $("#sheetBtn").textContent = open ? "Map" : "Places";
}
function render(){
  if (!TRIP) return;
  for (const [id, n] of [["#tabPlaces","places"],["#tabAdd","add"],["#tabPlan","plan"]]) $(id).setAttribute("aria-selected", String(tab === n || (n === "places" && tab === "place")));
  const v = $("#view"); v.replaceChildren();
  if (tab === "places") v.append(...viewPlaces());
  else if (tab === "place") v.append(...viewPlace());
  else if (tab === "add") v.append(...viewAdd());
  else v.append(...viewPlan());
}
function icon(p){
  const k = KINDS[p.kind] || KINDS.sight, col = `var(${G()[p.who]?.color || "--both"})`;
  return h("span",{class:"ic " + (p.status === "idea" ? "idea" : ""), style:p.status === "idea" ? `color:${col}` : `background:${col}`, html:svg(k.d)});
}
function cityOf(p){
  const parts = (p.address || "").split(",").map(s => s.trim()).filter(Boolean);
  const i = parts.findIndex(s => /^CA\b/.test(s));
  if (i > 0) return parts[i-1];
  if (parts.length >= 2) return parts[parts.length-1];
  return "No address yet";
}
function viewPlaces(){
  const out = [];
  const chips = (vals, cur, set) => vals.map(([k,l]) => h("button",{class:"chip","aria-pressed":String(cur === k), onclick:() => { set(k); render(); }}, l));
  out.push(h("div",{class:"seg",style:"margin-bottom:10px"}, ...[["city","By city"],["kind","By type"],["day","By day"]].map(([k,l]) =>
    h("button",{"aria-pressed":String(groupBy === k), onclick:() => { groupBy = k; try { localStorage.setItem("groupBy", k); } catch {} render(); }}, l))));
  out.push(h("div",{class:"filters"},
    chips([["all","All"],["confirmed","Confirmed"],["maybe","Maybe"],["idea","Ideas"]], fStatus, k => fStatus = k)));
  const kindSel = h("select",{id:"fKind"}, h("option",{value:"all"},"All types"), ...Object.entries(KINDS).map(([k,v]) => h("option",{value:k, selected:fKind === k}, v.label)));
  kindSel.onchange = () => { fKind = kindSel.value; render(); };
  const whoSel = h("select",{id:"fWho"}, ...[["all","Everyone"],["family",G().family.short],["friends",G().friends.short]].map(([k,l]) => h("option",{value:k, selected:fWho === k}, l)));
  whoSel.onchange = () => { fWho = whoSel.value; render(); };
  out.push(h("div",{class:"two",style:"margin-bottom:6px"}, h("label",{class:"f"},"Type", kindSel), h("label",{class:"f"},"For", whoSel)));
  const list = places.filter(p => (fStatus === "all" || p.status === fStatus) && (fWho === "all" || forGroup(p, fWho)) && (fKind === "all" || p.kind === fKind));
  if (!list.length) {
    out.push(h("div",{class:"empty"}, h("b",null, places.length ? "Nothing matches these filters" : "No places yet"), places.length ? "Try All, All types and Everyone." : "Add a restaurant, landmark or plan with + Add place."));
    return out;
  }
  const keyOf = p => groupBy === "city" ? cityOf(p) : groupBy === "kind" ? (KINDS[p.kind]?.label || "Other") : (p.day || "any");
  const groups = {};
  for (const p of list) (groups[keyOf(p)] ||= []).push(p);
  let order;
  if (groupBy === "day") order = [...DAYS.filter(d => groups[d]), ...(groups.any ? ["any"] : [])];
  else if (groupBy === "kind") order = Object.values(KINDS).map(k => k.label).filter(k => groups[k]).concat(groups.Other ? ["Other"] : []);
  else order = Object.keys(groups).sort((a,b) => a === "No address yet" ? 1 : b === "No address yet" ? -1 : groups[b].length - groups[a].length || a.localeCompare(b));
  const rank = {confirmed:0, maybe:1, idea:2};
  for (const k of order) {
    const head = groupBy === "day" ? (k === "any" ? "No day set yet" : dayName(k)) : k;
    out.push(h("div",{class:"dayhead"}, head + " · " + groups[k].length));
    groups[k].sort((a,b) => (rank[a.status] - rank[b.status]) || (a.day||"9").localeCompare(b.day||"9") || (a.time||"99").localeCompare(b.time||"99") || a.name.localeCompare(b.name));
    for (const p of groups[k]) {
      let dist = null;
      if (p.lng != null) {
        const g = fWho === "friends" ? "friends" : "family";
        const st = STAYS()[stayOn(g, p.day ? T(p.day + "T12:00") : t)];
        const m = hav(st.ll, [p.lng,p.lat]);
        dist = m < 0.2 ? "at " + (st.short || st.name) : miles(m * ROAD) + " from " + (st.short || st.name);
      }
      const when = p.day ? fmtWd.format(T(p.day + "T12:00")) + (p.time ? " " + fmtT.format(placeStart(p)) : "") : null;
      const meta = [groupBy === "kind" ? cityOf(p) : KINDS[p.kind]?.label, groupBy === "day" ? (p.time ? fmtT.format(placeStart(p)) : null) : when, dist].filter(Boolean).join(" · ");
      out.push(h("button",{class:"row", onclick:() => openPlace(p.id)}, icon(p),
        h("span",{style:"min-width:0"}, h("div",{class:"nm"}, p.name), h("div",{class:"mt"}, meta)),
        p.lng == null ? h("span",{class:"pill nopin"},"Needs pin") : h("span",{class:"pill " + p.status}, p.status)));
    }
  }
  return out;
}
function openPlace(id){
  selId = id; tab = "place"; render(); syncPins(); toggleSheet(true);
  const p = places.find(x => x.id === id);
  if (p && p.lng != null) { if (ride) $("#rideBtn").click(); flyTo([p.lng,p.lat], 1200); }
}
let distBox = null;
function renderDistances(){
  const p = places.find(x => x.id === selId); if (!p || !distBox) return;
  distBox.replaceChildren();
  if (p.lng == null) { distBox.append("Drop a pin to see distances."); return; }
  const ll = [p.lng,p.lat];
  if (p.day) {
    const tm = T(p.day + "T" + (p.time || "12:00"));
    distBox.append(h("div",{style:"font-weight:700"}, "On " + dayName(p.day)));
    for (const g of ["family","friends"]) {
      const st = STAYS()[stayOn(g, tm)], d = hav(st.ll, ll), going = forGroup(p, g);
      distBox.append(h("div",null, h("b",{style:`color:var(${G()[g].color})`}, G()[g].short + ": "),
        d < 0.2 ? "at " + (st.short || st.name) + (going ? " · adds 0 mi" : "")
          : h("span",null, h("span",{class:"dist"}, miles(d * ROAD)), " from " + (st.short || st.name) + (going ? " · about " + Math.round(d * ROAD * 2) + " mi round trip" : ""))));
    }
    distBox.append(h("div",{style:"color:var(--muted);font-size:12px;margin-top:4px"}, "Estimated road miles from where each car sleeps that night."));
    return;
  }
  for (const g of ["family","friends"]) {
    const c = carAt(g, t), st = STAYS()[stayOn(g, t)];
    distBox.append(h("div",null, h("b",{style:`color:var(${G()[g].color})`}, G()[g].short + ": "), h("span",{class:"dist"}, miles(hav(c.ll, ll))), " from the car · ", h("span",{class:"dist"}, miles(hav(st.ll, ll))), " from " + (st.short || st.name)));
  }
  distBox.append(h("div",{style:"color:var(--muted);font-size:12px;margin-top:4px"}, "Straight-line miles at " + fmtDT.format(t) + ". Set a day to see distances for that day."));
}

/* Google Places (New): search + photos */
const PLACES_FIELDS = "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.googleMapsUri";
async function placesSearch(q){
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {method:"POST",
    headers:{"Content-Type":"application/json","X-Goog-Api-Key":MAPS_KEY,"X-Goog-FieldMask":PLACES_FIELDS},
    body:JSON.stringify({textQuery:q, maxResultCount:5, locationBias:{rectangle:{low:{latitude:33.5,longitude:-123},high:{latitude:38,longitude:-117.3}}}})});
  if (!r.ok) throw new Error("Search failed (" + r.status + ")");
  const j = await r.json();
  return (j.places || []).map(p => ({gid:p.id, name:p.displayName?.text || q, addr:p.formattedAddress || "", ll:[p.location.longitude, p.location.latitude],
    photos:(p.photos || []).slice(0,6).map(x => ({n:x.name, by:x.authorAttributions?.[0]?.displayName || ""})), gmaps:p.googleMapsUri || ""}));
}
async function placesNearby(ll, radius){
  const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {method:"POST",
    headers:{"Content-Type":"application/json","X-Goog-Api-Key":MAPS_KEY,"X-Goog-FieldMask":PLACES_FIELDS},
    body:JSON.stringify({maxResultCount:6, rankPreference:"DISTANCE", locationRestriction:{circle:{center:{latitude:ll[1], longitude:ll[0]}, radius}}})});
  if (!r.ok) throw new Error("Lookup failed (" + r.status + ")");
  const j = await r.json();
  return (j.places || []).map(p => ({gid:p.id, name:p.displayName?.text || "", addr:p.formattedAddress || "", ll:[p.location.longitude, p.location.latitude],
    photos:(p.photos || []).slice(0,6).map(x => ({n:x.name, by:x.authorAttributions?.[0]?.displayName || ""})), gmaps:p.googleMapsUri || ""}));
}
async function whatsHere(ll){
  if (!MAPS_KEY) return;
  draft.nearby = "loading"; render();
  try {
    let res = await placesNearby(ll, 150);
    if (!res.length) res = await placesNearby(ll, 1500);
    draft.nearby = res;
  } catch (e) { draft.nearby = {error: e.message || "Lookup failed"}; }
  if (tab === "add") render();
}
function coordLine(ll){
  const txt = ll[1].toFixed(5) + ", " + ll[0].toFixed(5);
  const out = h("span",{class:"dist"}, txt);
  const btn = h("button",{type:"button", class:"btn", style:"padding:3px 8px;font-size:12px;margin-left:8px", onclick:async () => {
    try { await navigator.clipboard.writeText(txt); btn.textContent = "Copied"; } catch { const r = document.createRange(); r.selectNodeContents(out); getSelection().removeAllRanges(); getSelection().addRange(r); btn.textContent = "Selected"; }
  }}, "Copy");
  return h("span",null, out, btn);
}
const photoUrl = n => `https://places.googleapis.com/v1/${n}/media?maxHeightPx=400&key=${encodeURIComponent(MAPS_KEY)}`;
const photoTried = new Set();
async function ensurePhotos(p){
  if (!MAPS_KEY || p.photos || photoTried.has(p.id)) return;
  photoTried.add(p.id);
  try {
    const res = await placesSearch([p.name, p.address].filter(Boolean).join(", "));
    const best = res.find(r => p.lng == null || hav(r.ll, [p.lng,p.lat]) < 0.5) || null;
    await updateDoc(doc(db,"places",p.id), {photos: best ? best.photos : [], gid: best?.gid || "", gmaps: best?.gmaps || ""});
  } catch { /* leave the Google Maps link as the fallback */ }
}

function viewPlace(){
  const p = places.find(x => x.id === selId);
  if (!p) return [h("button",{class:"back", onclick:() => setTab("places")},"← All places"), h("div",{class:"empty"},"This place was removed.")];
  ensurePhotos(p);
  const out = [h("button",{class:"back", onclick:() => { selId = null; setTab("places"); syncPins(); }},"← All places")];
  const dt = h("div",{class:"dt"});
  dt.append(h("div",{style:"display:flex;gap:8px;align-items:center;margin-top:10px"}, icon(p), h("span",{class:"pill " + p.status}, p.status), h("span",{style:"color:var(--muted);font-size:13px"}, KINDS[p.kind]?.label || "")));
  dt.append(h("h2",null,p.name));
  if (MAPS_KEY && p.photos?.length) {
    dt.append(h("div",{class:"photos"}, ...p.photos.map(ph => h("img",{src:photoUrl(ph.n), alt:"Photo of " + p.name, loading:"lazy"}))));
    const by = [...new Set(p.photos.map(x => x.by).filter(Boolean))].slice(0,3).join(", ");
    dt.append(h("div",{class:"photocredit"}, "Photos via Google" + (by ? " · " + by : "")));
  }
  const kv = h("dl",{class:"kv"});
  const add = (k, v) => { if (v) kv.append(h("dt",null,k), h("dd",null,v)); };
  add("For", G()[p.who]?.label);
  add("When", p.day ? dayName(p.day) + (p.time ? " · " + fmtT.format(placeStart(p)) : "") : "No day yet");
  add("Address", p.address);
  if (p.lng != null) kv.append(h("dt",null,"Coordinates"), h("dd",null, coordLine([p.lng, p.lat])));
  add("Notes", p.note);
  if (p.url) kv.append(h("dt",null,"Link"), h("dd",null, h("a",{href:p.url,target:"_blank",rel:"noopener"}, p.url.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,""))));
  dt.append(kv);
  distBox = h("div",{style:"display:grid;gap:4px;font-size:14px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:10px"});
  dt.append(distBox);
  const gm = p.gmaps || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.name + " " + (p.address || ""));
  dt.append(h("a",{class:"photo", href:gm, target:"_blank", rel:"noopener"}, h("b",null,"Open in Google Maps ↗"), h("div",null,"Reviews, hours and directions.")));
  dt.append(h("div",{style:"margin-top:14px;font-size:13px;font-weight:700;color:var(--muted)"},"Status"));
  dt.append(h("div",{class:"seg"}, ...["idea","maybe","confirmed"].map(s => h("button",{"aria-pressed":String(p.status === s), onclick:() => updatePlace(p.id, {status:s})}, s[0].toUpperCase() + s.slice(1)))));
  const daySel = h("select",{id:"dDay"}, h("option",{value:""},"No day yet"), ...DAYS.map(d => h("option",{value:d, selected:p.day === d}, dayName(d))));
  const timeIn = h("input",{id:"dTime", type:"time", value:p.time || ""});
  const whoSel = h("select",{id:"dWho"}, ...Object.keys(G()).map(k => h("option",{value:k, selected:p.who === k}, G()[k].label)));
  const save = () => updatePlace(p.id, {day:daySel.value, time:timeIn.value, who:whoSel.value});
  daySel.onchange = save; timeIn.onchange = save; whoSel.onchange = save;
  dt.append(h("div",{class:"two",style:"margin-top:10px"}, h("label",{class:"f"},"Day", daySel), h("label",{class:"f"},"Time", timeIn)));
  dt.append(h("label",{class:"f",style:"margin-top:10px"},"For", whoSel));
  const confirmBox = h("span",{hidden:true}, "Remove this place for everyone? ",
    h("button",{class:"btn danger", onclick:() => deletePlace(p.id)},"Remove"), h("button",{class:"btn", onclick:() => { confirmBox.hidden = true; delBtn.hidden = false; }},"Keep"));
  const delBtn = h("button",{class:"btn danger", onclick:() => { delBtn.hidden = true; confirmBox.hidden = false; }},"Remove place");
  dt.append(h("div",{class:"btns"}, h("button",{class:"btn", onclick:() => startDrop(p.id)}, p.lng == null ? "Drop pin on map" : "Move pin"), delBtn, confirmBox));
  if (p.byName) dt.append(h("div",{style:"margin-top:14px;font-size:12px;color:var(--muted)"}, "Added by " + p.byName));
  out.push(dt); setTimeout(renderDistances); return out;
}

/* add form */
function newDraft(){ draft = {name:"", kind:"food", who:"both", status:"idea", day:"", time:"", address:"", note:"", url:"", lng:null, lat:null, locNote:"", results:null, msg:"", photos:null, gid:"", gmaps:""}; }
function viewAdd(){
  if (!draft) newDraft();
  const d = draft;
  const inp = (id, key, attrs) => { const el = h("input",{id, value:d[key], ...attrs}); el.oninput = () => { d[key] = el.value; }; return el; };
  const sel = (id, key, opts) => { const el = h("select",{id}, ...opts.map(([v,l]) => h("option",{value:v, selected:d[key] === v}, l))); el.onchange = () => { d[key] = el.value; }; return el; };
  const loc = h("div",{class:"locbox"});
  loc.append(h("div",{class:"st"}, d.lng != null ? h("span",null, h("b",{style:"color:var(--ok)"},"✓ Location set. "), d.locNote || "") : h("span",{style:"color:var(--muted)"}, MAPS_KEY ? "Search Google for the place, or drop a pin." : "Drop a pin on the map. Google search turns on once the Maps key is added.")));
  loc.append(h("div",{class:"btns",style:"margin-top:0"}, MAPS_KEY ? h("button",{type:"button", class:"btn", onclick:lookup}, "Search Google") : null, h("button",{type:"button", class:"btn", onclick:() => startDrop("draft")}, "Drop pin on map")));
  if (d.lng != null) loc.append(h("div",{class:"st"}, "Coordinates: ", coordLine([d.lng, d.lat])));
  if (d.nearby === "loading") loc.append(h("div",{class:"st",style:"color:var(--muted)"}, "Looking up what's here…"));
  else if (d.nearby?.error) loc.append(h("div",{class:"msg"}, "Couldn't look up this spot (" + d.nearby.error + "). The pin is still set."));
  else if (Array.isArray(d.nearby)) loc.append(h("div",{class:"st",style:"font-weight:700"}, d.nearby.length ? "What's here? Tap one to use it:" : "No businesses or landmarks right here. Name it yourself."),
    h("div",{class:"res"}, d.nearby.map(r => h("button",{type:"button", onclick:() => {
      d.lng = r.ll[0]; d.lat = r.ll[1]; d.name = r.name; d.address = r.addr; d.locNote = r.addr; d.photos = r.photos; d.gid = r.gid; d.gmaps = r.gmaps; d.nearby = null;
      showDraftPin(r.ll); render(); }},
      h("b",null, r.name), r.addr + " · " + (m => m < 0.2 ? Math.round(m*5280) + " ft" : miles(m))(hav([d.lng, d.lat], r.ll)) + " away"))));
  if (d.msg) loc.append(h("div",{class:"msg"}, d.msg));
  if (d.results) loc.append(h("div",{class:"res"}, d.results.length ? d.results.map(r => h("button",{type:"button", onclick:() => {
    d.lng = r.ll[0]; d.lat = r.ll[1]; d.address = r.addr; if (!d.name) d.name = r.name; d.locNote = r.addr; d.photos = r.photos; d.gid = r.gid; d.gmaps = r.gmaps; d.results = null; d.nearby = null; showDraftPin(r.ll); flyTo(r.ll, 1200); render(); }},
    h("b",null, r.name), r.addr)) : h("div",{class:"msg"},"No matches. Try adding the city.")));
  const form = h("form",{class:"add", onsubmit:async e => {
    e.preventDefault();
    if (!d.name.trim()) { d.msg = "Give the place a name."; render(); return; }
    const data = {name:d.name.trim(), kind:d.kind, who:d.who, status:d.status, day:d.day, time:d.time, dur:120, address:d.address.trim(), note:d.note.trim(),
      url:/^https?:\/\//.test(d.url.trim()) ? d.url.trim() : "", lng:d.lng, lat:d.lat, by:me.uid, byName:me.name, at:new Date().toISOString()};
    if (d.photos) { data.photos = d.photos; data.gid = d.gid; data.gmaps = d.gmaps; }
    try { const ref = await addDoc(collection(db,"places"), data); newDraft(); showDraftPin(null); openPlace(ref.id); }
    catch (err) { d.msg = "Couldn't save (" + (err.code || "error") + "). Check your connection and try again."; render(); }
  }},
    h("label",{class:"f"},"Name", inp("aName","name",{placeholder:"e.g. Alta Mesa Taqueria", required:true, autocomplete:"off"})),
    h("div",{class:"two"}, h("label",{class:"f"},"What", sel("aKind","kind", Object.entries(KINDS).map(([k,v]) => [k, v.label]))), h("label",{class:"f"},"For", sel("aWho","who", Object.entries(G()).map(([k,v]) => [k, v.label])))),
    h("div",{class:"two"}, h("label",{class:"f"},"Status", sel("aStatus","status",[["idea","Idea"],["maybe","Maybe"],["confirmed","Confirmed"]])), h("label",{class:"f"},"Day", sel("aDay","day",[["","Not sure yet"], ...DAYS.map(x => [x, dayName(x)])]))),
    h("label",{class:"f"},"Time (optional)", inp("aTime","time",{type:"time"})),
    h("label",{class:"f"},"Address or city", inp("aAddr","address",{placeholder:"Street, city", autocomplete:"off"})),
    loc,
    h("label",{class:"f"},"Notes", (() => { const el = h("textarea",{id:"aNote", rows:"2", placeholder:"Kid menu, reservation needed, etc."}); el.value = d.note; el.oninput = () => { d.note = el.value; }; return el; })()),
    h("label",{class:"f"},"Website (optional)", inp("aUrl","url",{type:"url", placeholder:"https://"})),
    h("button",{class:"btn primary", type:"submit", style:"justify-content:center;padding:11px"}, "Add to the map"));
  return [form];
}
async function lookup(){
  const d = draft, q = [d.name, d.address].filter(Boolean).join(", ");
  if (!q.trim()) { d.msg = "Type a name or address first."; render(); return; }
  d.msg = "Searching…"; d.results = null; render();
  try { d.results = await placesSearch(q); d.msg = ""; }
  catch (e) { d.msg = "Google search didn't work (" + (e.message || "error") + "). Use Drop pin on map instead."; }
  render();
}
function groundAt(pos){
  const Cesium = C();
  let cart;
  try { if (viewer.scene.pickPositionSupported) cart = viewer.scene.pickPosition(pos); } catch {}
  if (!cart || !Cesium.defined(cart)) cart = viewer.camera.pickEllipsoid(pos);
  if (!cart) return null;
  const c = Cesium.Cartographic.fromCartesian(cart);
  if (!c) return null;
  return [Number(Cesium.Math.toDegrees(c.longitude).toFixed(5)), Number(Cesium.Math.toDegrees(c.latitude).toFixed(5))];
}
let draftEnt = null;
function showDraftPin(ll){
  const Cesium = C();
  if (draftEnt) viewer.entities.remove(draftEnt);
  draftEnt = ll ? viewer.entities.add({position:Cesium.Cartesian3.fromDegrees(ll[0], ll[1]),
    billboard:{image:pinImage(draft?.kind || "sight", "#13603f", false), width:40, height:40, heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance:Number.POSITIVE_INFINITY, pixelOffset:new Cesium.Cartesian2(0, -24)},
    label:{text:(draft?.name || "New place") + " (not saved yet)", font:"700 13px Atkinson Hyperlegible, sans-serif", fillColor:Cesium.Color.WHITE,
      showBackground:true, backgroundColor:Cesium.Color.fromCssColorString("#13603f"), pixelOffset:new Cesium.Cartesian2(0, -52),
      heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance:Number.POSITIVE_INFINITY}}) : null;
}
function dropAt(pos){
  const ll = groundAt(pos);
  if (!ll) { $("#dropBar").firstChild.textContent = "That spot is sky. Tap on the ground. "; return; }
  const target = dropFor; endDrop();
  if (target === "draft") {
    draft.lng = ll[0]; draft.lat = ll[1]; draft.locNote = "Pin dropped on the map. Press Add to the map to save it.";
    draft.nearby = null; showDraftPin(ll); tab = "add"; render(); whatsHere(ll);
  } else {
    updatePlace(target, {lng:ll[0], lat:ll[1]}).then(() => { tab = "place"; selId = target; render(); });
  }
}
function startDrop(target){
  dropFor = target; $("#dropBar").firstChild.textContent = "Tap the map where the pin goes. ";
  $("#dropBar").hidden = false; viewer && (viewer.scene.canvas.style.cursor = "crosshair"); toggleSheet(false);
}
function endDrop(){ dropFor = null; $("#dropBar").hidden = true; viewer && (viewer.scene.canvas.style.cursor = ""); toggleSheet(true); }
$("#dropCancel").onclick = () => endDrop();
async function updatePlace(id, patch){
  try { await updateDoc(doc(db,"places",id), patch); }
  catch (e) { $("#view").prepend(h("div",{class:"notice"},"Couldn't save that change (" + (e.code || "error") + "). Try again.")); }
}
async function deletePlace(id){
  try { await deleteDoc(doc(db,"places",id)); selId = null; setTab("places"); }
  catch (e) { $("#view").prepend(h("div",{class:"notice"},"Couldn't remove it. Try again.")); }
}

/* drive plan + mileage */
function mileage(g){
  const plan = PLAN()[g];
  const byDay = {};
  let drives = 0, side = 0, counted = 0, nopin = 0;
  for (const d of DAYS) byDay[d] = {drive:0, side:0};
  for (const s of plan) if (s.drive) { const mi = DRIVES()[s.drive].mi; drives += mi; const dk = dayKey(T(s.at)); if (byDay[dk]) byDay[dk].drive += mi; }
  for (const d of DAYS) {
    const stops = places.filter(p => p.status === "confirmed" && p.day === d && forGroup(p, g)).sort((a,b) => (a.time || "12:00").localeCompare(b.time || "12:00"));
    const pinned = stops.filter(p => p.lng != null);
    nopin += stops.length - pinned.length;
    if (!pinned.length) continue;
    counted += pinned.length;
    const i = plan.findIndex(s => s.drive && dayKey(T(s.at)) === d);
    let from, to;
    if (i > 0) { from = STAYS()[plan[i-1].stay].ll; to = STAYS()[plan[i].to].ll; }
    else { from = to = STAYS()[stayOn(g, T(d + "T12:00"))].ll; }
    const pts = [from, ...pinned.map(p => [p.lng,p.lat]), to];
    let chain = 0; for (let k=1;k<pts.length;k++) chain += hav(pts[k-1], pts[k]);
    const extra = Math.max(0, (chain - (i > 0 ? hav(from, to) : 0)) * ROAD);
    side += extra; byDay[d].side += extra;
  }
  return {drives, side:Math.round(side), total:Math.round(drives + side), counted, nopin, byDay};
}
function shieldsFor(road){
  return road.split("·").map(s => s.trim()).map(s => { const m = s.match(/^(I|US|CA)-(\d+)/); return m ? h("span",{class:"shield " + (m[1] === "CA" ? "ca" : "")}, m[2]) : null; });
}
let openDays = null, importMsg = "";
const openCars = new Set();
function viewPlan(){
  const out = [];
  const M = {family:mileage("family"), friends:mileage("friends")};
  // per-car totals: each is a dropdown with that car's days, miles and confirmed stops
  const box = h("div",{style:"display:grid;gap:10px;margin-bottom:14px"});
  for (const g of ["family","friends"]) {
    const m = M[g];
    const sum = h("summary",{class:"csum"},
      h("div",{style:"display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"}, h("b",null, G()[g].label),
        h("span",{style:"font-family:var(--f-display);font-weight:800;font-size:28px;line-height:1"}, m.total.toLocaleString() + " mi")),
      h("div",{style:"font-size:13px;color:var(--muted)"}, m.drives + " mi main drives + about " + m.side + " mi to " + m.counted + " confirmed stop" + (m.counted === 1 ? "" : "s"),
        m.nopin ? " · " + m.nopin + " confirmed without a pin not counted" : ""));
    const body = h("div",{class:"cbody"});
    for (const d of DAYS) {
      const bd = m.byDay[d], dayTotal = Math.round(bd.drive + bd.side);
      const rows = [];
      for (const s of PLAN()[g]) {
        if (!s.drive || dayKey(T(s.at)) !== d) continue;
        const dr = DRIVES()[s.drive];
        rows.push({sort:T(s.at), el:h("div",{class:"crow"}, h("span",{class:"ct"}, fmtT.format(T(s.at))), h("span",{class:"cn"}, ...shieldsFor(dr.road), " Drive to " + (STAYS()[s.to].short || STAYS()[s.to].name)), h("span",{class:"cm"}, dr.mi + " mi"))});
      }
      const st = STAYS()[stayOn(g, T(d + "T12:00"))];
      for (const p of places.filter(p => p.status === "confirmed" && p.day === d && forGroup(p, g))) {
        const dist = p.lng != null ? hav(st.ll, [p.lng,p.lat]) : null;
        rows.push({sort:p.time ? placeStart(p) : T(d + "T23:58"), el:h("button",{class:"crow", onclick:() => openPlace(p.id)},
          h("span",{class:"ct"}, p.time ? fmtT.format(placeStart(p)) : "Any time"), h("span",{class:"cn"}, p.name),
          h("span",{class:"cm"}, dist == null ? "no pin" : dist < 0.2 ? "0 mi" : "~" + Math.round(dist*ROAD*2) + " mi rt"))});
      }
      rows.sort((x,y) => x.sort - y.sort);
      body.append(h("div",{class:"cday"},
        h("div",{class:"cdh"}, h("span",null, dayName(d)), h("span",{class:"cm"}, dayTotal + " mi" + (bd.drive && bd.side >= 1 ? " (" + Math.round(bd.drive) + " drive + " + Math.round(bd.side) + " stops)" : ""))),
        rows.length ? rows.map(r => r.el) : h("div",{class:"crow muted"}, "Free day at " + (st.short || st.name))));
    }
    const det = h("details",{class:"cart", style:`border-left-color:var(${G()[g].color})`, open:openCars.has(g)}, sum, body);
    det.addEventListener("toggle", () => { det.open ? openCars.add(g) : openCars.delete(g); });
    box.append(det);
  }
  out.push(box);
  out.push(h("p",{style:"margin:12px 0;color:var(--muted);font-size:13px"},"Main drives come from TomTom with typical traffic, plus about 15% for stops. Miles to confirmed stops are estimates from where each car sleeps that night."));
  if (TRIP.notice) out.push(h("div",{class:"notice"}, TRIP.notice));
  // trip update loader
  const f = h("input",{type:"file", accept:".json,application/json", id:"updFile", style:"max-width:100%"});
  const msg = h("div",{class:"msg", id:"updMsg"}, importMsg);
  f.onchange = () => importFile(f.files[0], msg);
  out.push(h("div",{class:"locbox",style:"margin-top:12px"},
    h("div",{class:"st"}, h("b",null,"Load trip update. "), "Pick an update file from Claude to change drives, times or stays. Places stay as they are."), f, msg));
  return out;
}
function drawLegend(){
  const l = $("#legend"); l.replaceChildren(
    ...["family","friends"].map(g => h("div",null, h("i",{style:`background:var(${G()[g].color})`}), G()[g].label)),
    h("div",{style:"color:var(--muted)"},"Hollow pin = idea · solid = maybe or confirmed · 3D piece = confirmed or where you sleep"));
}

/* ===================== import (first run) ===================== */
function showImport(){
  const msg = h("div",{class:"msg", id:"impMsg"});
  $("#view").replaceChildren(h("div",{class:"import"},
    h("div",{class:"notice"}, h("b",null,"No trip loaded yet. "), "Olaf: choose the trip file Claude sent you. This copies the drives, stays and places into the shared database once."),
    (() => { const f = h("input",{type:"file", accept:".json,application/json", id:"impFile"}); f.onchange = () => importFile(f.files[0], msg); return f; })(),
    msg));
  toggleSheet(true);
}
async function importFile(file, msg){
  try {
    const data = JSON.parse(await file.text());
    if (!data.trip) throw new Error("This isn't a trip file from Claude.");
    msg.textContent = "Loading…";
    await setDoc(doc(db,"trip","main"), data.trip);
    let added = 0;
    if (Array.isArray(data.places)) {
      const have = new Set(places.map(p => p.id));
      const fresh = data.places.filter(p => !have.has(p.id));
      for (let i=0;i<fresh.length;i+=400) {
        const b = writeBatch(db);
        for (const p of fresh.slice(i, i+400)) { const {id, ...rest} = p; b.set(doc(db,"places", id), rest); }
        await b.commit();
      }
      added = fresh.length;
    }
    importMsg = "✓ Trip updated" + (added ? " and " + added + " places added" : "") + ".";
    msg.textContent = importMsg; const live = $("#updMsg"); if (live) live.textContent = importMsg;
    if (!TRIP) await loadTrip();
  } catch (e) { msg.textContent = "Couldn't load that file: " + (e.message || e.code || e); }
}

/* ===================== boot ===================== */
let started = false;
async function loadTrip(){
  const snap = await getDoc(doc(db,"trip","main"));
  if (!snap.exists()) { showImport(); return; }
  TRIP = snap.data();
  START = T(TRIP.start); END = T(TRIP.end); DAYS = TRIP.days;
  t = T(TRIP.days[0] + "T09:00");
  $("#title").textContent = TRIP.title || "Road Trip";
  $("#subtitle").textContent = TRIP.subtitle || "";
  document.title = TRIP.title || "Road Trip";
  buildRoutes(); buildDays(); drawLegend();
  if (viewer) { drawRoutes(); drawStays(); drawCars(); }
  if (!started) {
    started = true;
    onSnapshot(collection(db,"places"), s => {
      places = s.docs.map(d => ({id:d.id, ...d.data()}));
      syncPins();
      if (tab !== "add") render();
      tick(false);
    }, e => banner("Places stopped updating (" + e.code + "). Reload the page."));
    onSnapshot(doc(db,"trip","main"), s => {
      if (!s.exists()) return;
      TRIP = s.data(); START = T(TRIP.start); END = T(TRIP.end); DAYS = TRIP.days;
      buildRoutes(); buildDays(); drawLegend();
      if (viewer) { drawRoutes(); drawStays(); drawCars(); syncPins(); }
      render(); tick(false);
    });
  }
  render(); tick(false);
}
async function gate(user){
  me.uid = user.uid;
  const m = await getDoc(doc(db,"members",user.uid)).catch(() => null);
  if (m && m.exists()) { me.name = m.data().name || ""; $("#gate").hidden = true; await loadTrip(); return; }
  $("#gate").hidden = false;
  $("#gName").focus();
}
$("#gateForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#gName").value.trim(), code = $("#gCode").value.trim();
  $("#gBtn").disabled = true; $("#gMsg").textContent = "Checking…";
  try {
    await setDoc(doc(db,"members",me.uid), {code, name, at:serverTimestamp()});
    me.name = name; $("#gate").hidden = true; $("#gMsg").textContent = "";
    await loadTrip();
  } catch (err) {
    $("#gMsg").textContent = err.code === "permission-denied" ? "That passcode doesn't match. Check the text from Olaf and try again." : "Couldn't connect (" + (err.code || "error") + "). Try again.";
  } finally { $("#gBtn").disabled = false; }
});

initMap().then(() => { if (TRIP) { drawRoutes(); drawStays(); drawCars(); syncPins(); } });
onAuthStateChanged(auth, user => { if (user) gate(user); });
signInAnonymously(auth).catch(e => { $("#gate").hidden = false; $("#gMsg").textContent = "Sign-in is turned off (" + e.code + "). Olaf: enable Anonymous sign-in in Firebase."; });
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (TRIP && viewer) { drawRoutes(); drawCars(); for (const [,v] of ents.pins) v.sig = ""; syncPins(); } }); } catch {}
