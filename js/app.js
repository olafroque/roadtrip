import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getStorage, ref as sref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";
import { firebaseConfig, MAPS_KEY } from "./config.js?v=202610270927";

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
  // Cesium's built-in double-click "track this object" fights our own Follow; turn it off.
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  viewer.camera.moveEnd.addEventListener(() => {
    // while following a car the camera works in the car's local frame; skip the clamp so they don't fight
    if (viewer.trackedEntity) { rescaleModels(false); return; }
    const c = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
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
    if (Array.isArray(picked?.id)) { zoomToEntities(picked.id); return; }
    const ph = picked?.id?.properties?.photoId?.getValue();
    if (ph) { openPhoto(ph); return; }
    const id = picked?.id?.properties?.placeId?.getValue();
    if (id) { openPlace(id); return; }
    const sk = picked?.id?.properties?.stayKey?.getValue();
    if (sk) openStay(sk);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  initPins();
  initPhotoLayer();
  $("#photoBtn").setAttribute("aria-pressed", String(showPhotos));
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
  return Math.min(3000, Math.max(mode === "3d" ? 5 : 6, hgt / (mode === "3d" ? 450 : 260)));
}
function rescaleModels(force){
  if (!viewer) return;
  const u = unitForCamera();
  if (!force && lastU && Math.abs(u - lastU) / lastU < 0.15) return;
  U = u; lastU = u;
  for (const [key, s] of modelSpecs) buildModel(key, s);
  kickRender();
}
/* Custom low-poly pieces for specific confirmed places (keyed by place id).
   Units: 1 = U meters. x = east, y = north, z = up (part center). h/pt/roll = heading/pitch/roll in degrees. */
const CB = (x,y,z,w,d,hgt,c,o={}) => ({t:"box", x,y,z, dim:[w,d,hgt], c, roll:o.roll||0, h:o.h||0, pt:o.pt||0});
const CC = (x,y,z,len,r,rt,c) => ({t:"cyl", x,y,z, len, r, rt:rt ?? r, c});
const CUSTOM = {
  // Monterey Bay Aquarium front entrance, as a single game piece:
  // gabled concrete cannery hall facing the street, multi-pane industrial windows, glass entry with canopy,
  // blue sign band, the three original cannery smokestacks on the side wing, and a whale tail in a pool on the stand.
  aquarium: () => [
    CB(0,0.2,1.5, 5.6,3.6,3.0,"#dcd7cb"),
    ...[0,1,2,3,4].map(k => CB(0,0.2,3.0 + 0.27 + k*0.54, 5.9*(1 - k/5.2),3.9,0.54, k % 2 ? "#97a3aa" : "#8d9aa1")),   // stepped gable roof, ridge front-to-back
    ...[-2.0,-0.7,0.7,2.0].map(x => CB(x,-1.62,2.1, 0.9,0.06,0.7,"#2f4b5f")),
    CB(-2.0,-1.62,1.0, 0.9,0.06,0.7,"#2f4b5f"), CB(2.0,-1.62,1.0, 0.9,0.06,0.7,"#2f4b5f"),
    CB(0,-1.63,2.75, 3.6,0.06,0.34,"#1f6fa5"), CB(0,-1.65,2.75, 2.6,0.04,0.1,"#ffffff"),
    CB(0,-2.1,0.75, 2.2,1.0,1.5,"#9fd8f0"), CB(0,-2.2,1.6, 2.8,1.3,0.18,"#2f3a40"), CB(0,-2.61,0.55, 0.9,0.04,1.1,"#2f3a40"),
    CB(-3.6,0.8,1.0, 1.8,2.6,2.0,"#cfc9bb"), CB(-3.6,0.8,2.06, 1.9,2.7,0.12,"#8d9aa1"),
    CC(-3.95,0.2,3.6, 3.2,0.3,0.26,"#7a6a60"), CC(-3.25,1.0,3.9, 3.8,0.3,0.26,"#7a6a60"), CC(-3.95,1.6,3.4, 2.8,0.3,0.26,"#7a6a60"),
    CC(-3.95,0.2,5.25, 0.18,0.34,0.34,"#2f3a40"), CC(-3.25,1.0,5.85, 0.18,0.34,0.34,"#2f3a40"), CC(-3.95,1.6,4.85, 0.18,0.34,0.34,"#2f3a40"),
    CC(3.3,-2.5,0.03, 0.06,0.95,0.95,"#3d8fc6"),
    CC(3.3,-2.5,0.4, 0.6,0.22,0.16,"#2d3e50"),
    CB(2.98,-2.5,0.82, 0.75,0.3,0.1,"#2d3e50",{pt:28}), CB(3.62,-2.5,0.82, 0.75,0.3,0.1,"#2d3e50",{pt:-28})
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
/* .glb game pieces, keyed by place id or by "stay:<key>".
   width = the model's footprint in its own units; size = how wide it should stand on the board, in game units;
   heading = degrees to turn it so its front faces the street/camera. */
// Standard piece size: every game piece is as wide as the Oslovar House (15 units across its base).
const PIECE_W = 15;
const GLB = {
  aquarium:      {uri:"models/aquarium_meshy.glb", width:1.9, size:PIECE_W, heading:90},   // Meshy model, optimized (my code-built one: models/aquarium.glb)
  labicyclette:  {uri:"models/labicyclette.glb", width:1.9, size:PIECE_W, heading:90},   // Meshy model, optimized
  "stay:sc":     {uri:"models/oslovar.glb",  width:1.9, size:PIECE_W, heading:90}      // Meshy model, optimized
};
// the piece for the place open in the panel stands taller so it's easy to see
const SEL_GROW = 3;
const growOf = id => id && id === selId ? SEL_GROW : 1;
let selStay = null;
const selKeys = () => [selId ? "place:" + selId : null, selStay ? "stay:" + selStay : null].filter(Boolean);
const growKey = key => selKeys().includes(key) ? SEL_GROW : 1;
let lastKeys = [];
function regrowSelected(){
  const now = selKeys();
  if (now.join() === lastKeys.join()) return;
  for (const k of new Set([...lastKeys, ...now])) if (modelSpecs.has(k)) buildModel(k, modelSpecs.get(k));
  lastKeys = now; kickRender();
}
// pieces are built in the background; ask for a few redraws so the new size shows without touching the map
function kickRender(){ if (!viewer) return; for (const ms of [0, 200, 500, 1000, 1800]) setTimeout(() => viewer.scene.requestRender(), ms); }
// what a click on a piece opens: a place, or a stay (house or hotel)
const pieceProps = (key, s) => s.placeId ? {placeId:s.placeId} : key.startsWith("stay:") ? {stayKey:key.slice(5)} : undefined;
function buildModel(key, s){
  const Cesium = C();
  const old = ents.models.get(key);
  const gl = (s.placeId && GLB[s.placeId]) || GLB[key];
  if (gl) {
    if (old && old.glb) return;   // already on the map; its scale follows U on its own
    const pos = Cesium.Cartesian3.fromDegrees(s.ll[0], s.ll[1]);
    const e = viewer.entities.add({position:pos, properties:pieceProps(key, s),
      orientation:Cesium.Transforms.headingPitchRollQuaternion(pos, new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(gl.heading || 0), 0, 0)),
      model:{uri:gl.uri + "?v=202610270927", scale:new Cesium.CallbackProperty(() => U * gl.size / gl.width * growKey(key), false), heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,
        shadows:Cesium.ShadowMode.CAST_ONLY, silhouetteColor:Cesium.Color.fromCssColorString(s.accent || "#13603f"), silhouetteSize:2}});
    const list = [e]; list.glb = true;
    ents.models.set(key, list);
    if (old) for (const x of old) viewer.entities.remove(x);
    return;
  }
  if (old) for (const e of old) viewer.entities.remove(e);
  const parts = partsFor(s.kind, s.accent, s.placeId).map(p => ({...p, z:p.z + 0.22}));
  // board-game stand: a cream disc with a colored rim under every piece
  let r = 0;
  for (const p of parts) r = Math.max(r, p.t === "box" ? Math.hypot(Math.abs(p.x) + p.dim[0]/2, Math.abs(p.y) + p.dim[1]/2) : Math.hypot(p.x, p.y) + p.r);
  r = Math.min(r + 0.35, 7);
  // local unit: scaled so the stand is PIECE_W across (same as the Oslovar House), and grown when selected
  const list = [], UL = U * growKey(key) * (PIECE_W / 2) / (r + 0.22);
  const mLon = UL / (111320*Math.cos(s.ll[1]*Math.PI/180)), mLat = UL / 110540;
  parts.unshift({t:"cyl", x:0,y:0,z:0.07, len:0.14, r:r+0.22, rt:r+0.22, c:s.accent || "#13603f"}, {t:"cyl", x:0,y:0,z:0.17, len:0.1, r, rt:r, c:"#f6f1e7"});
  const SH = Cesium.ShadowMode.CAST_ONLY;   // pieces cast soft shadows on the map; no self-shadow streaks
  for (const p of parts) {
    const pos = Cesium.Cartesian3.fromDegrees(s.ll[0] + p.x*mLon, s.ll[1] + p.y*mLat, p.z*UL);
    const color = Cesium.Color.fromCssColorString(p.c);
    const base = {position:pos, properties:pieceProps(key, s)};
    if (p.t === "box") {
      if (p.roll || p.h || p.pt) base.orientation = Cesium.Transforms.headingPitchRollQuaternion(pos, new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(p.h||0), Cesium.Math.toRadians(p.pt||0), Cesium.Math.toRadians(p.roll||0)));
      base.box = {dimensions:new Cesium.Cartesian3(p.dim[0]*UL, p.dim[1]*UL, p.dim[2]*UL), material:color, heightReference:Cesium.HeightReference.RELATIVE_TO_GROUND, shadows:SH};
    } else {
      base.cylinder = {length:p.len*UL, topRadius:p.rt*UL, bottomRadius:p.r*UL, material:color, heightReference:Cesium.HeightReference.RELATIVE_TO_GROUND, slices:24, shadows:SH};
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
    ents.stays.push(viewer.entities.add({position:Cesium.Cartesian3.fromDegrees(s.ll[0], s.ll[1]), properties:{stayKey:k},
      label:{text:s.short || s.name, font:"700 14px Atkinson Hyperlegible, sans-serif", fillColor:Cesium.Color.WHITE, outlineColor:Cesium.Color.BLACK, outlineWidth:4,
        style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.TOP, pixelOffset:new Cesium.Cartesian2(0, 14),
        heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance:Number.POSITIVE_INFINITY,
        distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0, 25000),
        showBackground:true, backgroundColor:Cesium.Color.fromCssColorString("#13603f")}}));
  }
}

/* pins + confirmed models */
/* pin clustering: nearby pins merge into a "5 places" bubble that splits apart as you zoom in */
let pinDS = null;
function clusterImage(n){
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="44" viewBox="0 0 96 44">
    <rect x="2" y="2" width="92" height="40" rx="20" fill="#17221d" stroke="#ffffff" stroke-width="3"/>
    <text x="48" y="28" text-anchor="middle" font-family="Atkinson Hyperlegible, Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${n} places</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}
function initPins(){
  const Cesium = C();
  pinDS = new Cesium.CustomDataSource("pins");
  viewer.dataSources.add(pinDS);
  const cl = pinDS.clustering;
  cl.enabled = true; cl.pixelRange = 34; cl.minimumClusterSize = 3; cl.clusterLabels = true; cl.clusterBillboards = true;
  cl.clusterEvent.addEventListener((list, cluster) => {
    cluster.label.show = false;
    cluster.billboard.show = true;
    cluster.billboard.image = clusterImage(list.length);
    cluster.billboard.width = 88; cluster.billboard.height = 40;
    cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
    cluster.billboard.pixelOffset = new Cesium.Cartesian2(0, -30);   // float above the pieces so they stay visible
    cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    cluster.billboard.id = list;   // so a tap can zoom to these places
  });
}
function zoomToEntities(list){
  const Cesium = C();
  const pts = list.map(e => e.position?.getValue(viewer.clock.currentTime)).filter(Boolean);
  if (!pts.length) return;
  const bs = Cesium.BoundingSphere.fromPoints(pts);
  viewer.camera.flyToBoundingSphere(bs, {offset:new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-20), Cesium.Math.toRadians(-50), Math.max(bs.radius * 3.2, 2500)), duration:1.2});
}
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
    if (cur) pinDS.entities.remove(cur.e);
    const col = gcol(p.who);
    const atStay = Object.values(STAYS()).some(s => s.model && hav(s.ll, [p.lng,p.lat]) < 0.1);
    const piece = p.status === "confirmed" && !atStay;
    const e = pinDS.entities.add({
      // confirmed places: the name floats just above the top of their game piece
      position: piece ? new Cesium.CallbackProperty(() => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 10 * U * growOf(p.id)), false) : Cesium.Cartesian3.fromDegrees(p.lng, p.lat),
      properties:{placeId:p.id},
      billboard:(piece || (atStay && p.id !== selId)) ? undefined : {image:pinImage(p.kind, col, p.status === "idea"), width:p.id === selId ? 44 : 34, height:p.id === selId ? 44 : 34,
        heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, verticalOrigin:Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance:Number.POSITIVE_INFINITY, pixelOffset:new Cesium.Cartesian2(0, -24)},
      label:atStay && p.id !== selId ? undefined : {text:p.name, font:"700 13px Atkinson Hyperlegible, sans-serif", fillColor:Cesium.Color.WHITE, outlineColor:Cesium.Color.BLACK, outlineWidth:3,
        style:Cesium.LabelStyle.FILL_AND_OUTLINE, verticalOrigin:Cesium.VerticalOrigin.BOTTOM, pixelOffset:new Cesium.Cartesian2(0, piece ? -4 : -48),
        heightReference: piece ? Cesium.HeightReference.RELATIVE_TO_GROUND : Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance:Number.POSITIVE_INFINITY,
        distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0, p.id === selId ? 1e7 : p.status === "confirmed" ? 60000 : 12000)}
    });
    ents.pins.set(p.id, {e, sig});
    // 3D model for confirmed places (not when the plan is at a stay)
    if (p.status === "confirmed" && !atStay) addModel("place:" + p.id, p.kind, [p.lng,p.lat], col, p.id); else removeModel("place:" + p.id);
  }
  for (const [id, v] of ents.pins) if (!seen.has(id)) { pinDS.entities.remove(v.e); ents.pins.delete(id); removeModel("place:" + id); }
  regrowSelected();
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
    const CU = () => Math.max(U * 1.1, 6);    // cars slightly oversized so they read as game tokens
    // when parked (at a stay or a stop), the two cars sit side by side in front of the piece instead of on top of it
    const park = g === "family" ? [-3.4, -11] : [3.4, -11];
    const spot = c => c.mode === "drive" ? c.ll : [c.ll[0] + park[0]*U / (111320*Math.cos(c.ll[1]*Math.PI/180)), c.ll[1] + park[1]*U / 110540];
    const parts = CAR_PARTS(gcol(g)).map(pt => {
      const posAt = () => {
        const c = carAt(g, t), b = c.mode === "drive" ? (c.bearing || 0) : 0, u = CU(), ll = spot(c);
        const east = pt.f*u*Math.sin(b) + pt.r*u*Math.cos(b), north = pt.f*u*Math.cos(b) - pt.r*u*Math.sin(b);
        return Cesium.Cartesian3.fromDegrees(ll[0] + east / (111320*Math.cos(ll[1]*Math.PI/180)), ll[1] + north / 110540, pt.z*u);
      };
      return viewer.entities.add({
        position:new Cesium.CallbackProperty(posAt, false),
        orientation:new Cesium.CallbackProperty(() => Cesium.Transforms.headingPitchRollQuaternion(posAt(), new Cesium.HeadingPitchRoll((() => { const c = carAt(g, t); return c.mode === "drive" ? (c.bearing || 0) : 0; })() - Math.PI/2, 0, 0)), false),
        box:{dimensions:new Cesium.CallbackProperty(() => new Cesium.Cartesian3(pt.dim[0]*CU(), pt.dim[1]*CU(), pt.dim[2]*CU()), false),
          material:Cesium.Color.fromCssColorString(pt.c), heightReference:Cesium.HeightReference.RELATIVE_TO_GROUND, shadows:Cesium.ShadowMode.CAST_ONLY}
      });
    });
    ents.cars[g + ":parts"] = parts;
    // label + camera target
    ents.cars[g] = viewer.entities.add({
      viewFrom:new Cesium.Cartesian3(-2600, -5200, 4200),   // ~7 km back: roads, towns and both cars stay readable
      position:new Cesium.CallbackProperty(() => { const ll = spot(carAt(g, t)); return Cesium.Cartesian3.fromDegrees(ll[0], ll[1]); }, false),
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
    t += dt * (ride ? 6 : driving ? 20 : 80) * 1000;   // half the original speed
    if (t >= END) { t = END; tick(false); stopPlay(); return; }
    tick(false); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
$("#playBtn").innerHTML = PLAY_ICON;
$("#playBtn").addEventListener("click", () => playing ? stopPlay() : startPlay());

/* map tools */
$("#modeBtn").onclick = () => { if (viewer) setMode(mode === "3d" ? "board" : "3d"); };

// "Go to" menu: follow a car, today's area, whole trip
function follow(g){
  ride = g || false;
  const b = $("#goBtn");
  b.setAttribute("aria-pressed", String(!!ride));
  b.textContent = ride ? "Following " + carName(ride) + " ▾" : "Go to ▾";
  if (!viewer) return;
  viewer.trackedEntity = ride ? ents.cars[ride] : undefined;
  banner(ride ? "Following " + carName(ride) + ". Press play to drive. Drag to look around." : "");
}
const carName = g => G()[g].short.replace(/^Our\b/, "our");
const stopFollow = () => { if (ride) follow(false); };
function fitToday(){
  stopFollow();
  if (!viewer) return;
  const Cesium = C(), d = dayKey(t), pts = [];
  for (const g of ["family","friends"]) {
    pts.push(STAYS()[stayOn(g, T(d + "T06:00"))].ll, STAYS()[stayOn(g, T(d + "T23:30"))].ll);
    for (const s of PLAN()[g]) if (s.drive && dayKey(T(s.at)) === d) { const r = RT[DRIVES()[s.drive].route]; if (r) pts.push(...r.pts.filter((_, i) => i % 20 === 0), r.pts[r.pts.length-1]); }
  }
  for (const p of places) if (p.status === "confirmed" && p.day === d && p.lng != null) pts.push([p.lng, p.lat]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let w = Math.min(...xs), e = Math.max(...xs), s = Math.min(...ys), n = Math.max(...ys);
  const pad = Math.max(0.03, (e - w) * 0.15, (n - s) * 0.15);
  viewer.camera.flyTo({destination:Cesium.Rectangle.fromDegrees(w - pad, s - pad, e + pad, n + pad), duration:1.4});
}
function goMenu(open){
  const m = $("#goMenu"), show = open ?? m.hidden;
  if (show) {
    const items = [];
    for (const g of ["family","friends"]) items.push(h("button",{role:"menuitem", onclick:() => { goMenu(false); follow(g); }},
      h("i",{style:`background:var(${G()[g].color})`}), "Follow " + carName(g)));
    if (ride) items.push(h("button",{role:"menuitem", onclick:() => { goMenu(false); follow(false); }}, "Stop following"));
    items.push(h("button",{role:"menuitem", onclick:() => { goMenu(false); fitToday(); }}, "Today: " + dayName(dayKey(t))));
    items.push(h("button",{role:"menuitem", onclick:() => { goMenu(false); stopFollow(); fitTrip(); }}, "Whole trip"));
    m.replaceChildren(...items);
  }
  m.hidden = !show; $("#goBtn").setAttribute("aria-expanded", String(show));
}
$("#goBtn").onclick = e => { e.stopPropagation(); goMenu(); };
document.addEventListener("click", e => { if (!$("#goMenu").hidden && !e.target.closest("#goMenu")) goMenu(false); });

// Near me: the phone's own location as a blue dot
let meEnt = null, meWatch = null;
$("#nearBtn").onclick = () => {
  if (!navigator.geolocation) { banner("This browser can't share its location."); return; }
  const b = $("#nearBtn"); b.textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(pos => {
    b.textContent = "Near me";
    const ll = [pos.coords.longitude, pos.coords.latitude];
    showMe(ll); stopFollow(); flyTo(ll, 2500);
    if (meWatch == null) meWatch = navigator.geolocation.watchPosition(p => showMe([p.coords.longitude, p.coords.latitude]), () => {}, {enableHighAccuracy:true, maximumAge:30000});
  }, err => {
    b.textContent = "Near me";
    banner(err.code === 1 ? "Location is blocked. Allow location for this site in your browser settings, then try again." : "Couldn't find your location. Try again outside or with Wi-Fi on.");
    setTimeout(() => banner(""), 6000);
  }, {enableHighAccuracy:true, timeout:12000, maximumAge:60000});
};
function showMe(ll){
  if (!viewer) return;
  const Cesium = C();
  const pos = Cesium.Cartesian3.fromDegrees(ll[0], ll[1]);
  if (meEnt) { meEnt.position = pos; }
  else meEnt = viewer.entities.add({position:pos, point:{pixelSize:16, color:Cesium.Color.fromCssColorString("#1c7ed6"), outlineColor:Cesium.Color.WHITE, outlineWidth:3,
    heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance:Number.POSITIVE_INFINITY},
    label:{text:"You", font:"700 12px Atkinson Hyperlegible, sans-serif", fillColor:Cesium.Color.WHITE, showBackground:true, backgroundColor:Cesium.Color.fromCssColorString("#1c7ed6"),
      pixelOffset:new Cesium.Cartesian2(0, -20), heightReference:Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance:Number.POSITIVE_INFINITY}});
  viewer.scene.requestRender();
}
function goStay(k){ openStay(k); if (matchMedia("(max-width: 820px)").matches) toggleSheet(false); }
function openStay(k){
  selId = null; selStay = k; tab = "stay"; render(); syncPins(); toggleSheet(true);
  stopFollow(); flyTo(STAYS()[k].ll, 1100);
}

/* ===================== panel ===================== */
function setTab(n){ tab = n; if (n !== "stay") { selStay = null; regrowSelected(); } render(); }
$("#tabPlaces").onclick = () => { selId = null; setTab("places"); syncPins(); };
$("#tabAdd").onclick = () => { if (!draft) newDraft(); setTab("add"); };
$("#tabPlan").onclick = () => setTab("plan");
$("#tabPhotos").onclick = () => setTab("photos");
$("#actBtn").onclick = () => { setTab("activity"); toggleSheet(true); };
$("#photoBtn").onclick = () => togglePhotos();
$("#pv").addEventListener("click", e => { if (e.target.id === "pv") closePhoto(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && pvId) closePhoto(); });
$("#sheetBtn").onclick = () => toggleSheet();
function toggleSheet(force){
  const p = $("#panel"); const open = force ?? !p.classList.contains("open");
  p.classList.toggle("open", open); $("#sheetBtn").setAttribute("aria-expanded", String(open)); $("#sheetBtn").textContent = open ? "Map" : "Places";
}
function render(){
  if (!TRIP) return;
  for (const [id, n] of [["#tabPlaces","places"],["#tabAdd","add"],["#tabPlan","plan"],["#tabPhotos","photos"]]) $(id).setAttribute("aria-selected", String(tab === n || (n === "places" && tab === "place")));
  const v = $("#view"); v.replaceChildren();
  if (tab === "places") v.append(...viewPlaces());
  else if (tab === "place") v.append(...viewPlace());
  else if (tab === "add") v.append(...viewAdd());
  else if (tab === "photos") v.append(...viewPhotos());
  else if (tab === "stay") v.append(...viewStay());
  else if (tab === "activity") v.append(...viewActivity());
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
  selStay = null; selId = id; tab = "place"; render(); syncPins(); toggleSheet(true);
  const p = places.find(x => x.id === id);
  if (p && p.lng != null) { stopFollow(); flyTo([p.lng,p.lat], 1100); }
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

let editOpen = false;
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
  // everything else stays editable after a place is confirmed
  const eName = h("input",{id:"eName", value:p.name || "", maxlength:"80"});
  const eKind = h("select",{id:"eKind"}, ...Object.entries(KINDS).map(([k,v]) => h("option",{value:k, selected:p.kind === k}, v.label)));
  const eAddr = h("input",{id:"eAddr", value:p.address || ""});
  const eNote = h("textarea",{id:"eNote", rows:"3"}, p.note || "");
  const eUrl = h("input",{id:"eUrl", value:p.url || "", placeholder:"https://"});
  eName.onchange = () => { const v = eName.value.trim(); if (v) updatePlace(p.id, {name:v}); else eName.value = p.name; };
  eKind.onchange = () => updatePlace(p.id, {kind:eKind.value});
  eAddr.onchange = () => updatePlace(p.id, {address:eAddr.value.trim()});
  eNote.onchange = () => updatePlace(p.id, {note:eNote.value.trim()});
  eUrl.onchange = () => { const v = eUrl.value.trim(); updatePlace(p.id, {url:/^https?:\/\//.test(v) ? v : ""}); };
  const ed = h("details",{class:"edit", open:editOpen},
    h("summary",null,"Edit name, type, address, notes"),
    h("label",{class:"f"},"Name", eName),
    h("label",{class:"f"},"What", eKind),
    h("label",{class:"f"},"Address", eAddr),
    h("label",{class:"f"},"Notes", eNote),
    h("label",{class:"f"},"Link", eUrl),
    h("div",{style:"font-size:12px;color:var(--muted)"},"Changes save as soon as you leave a box."));
  ed.addEventListener("toggle", () => { editOpen = ed.open; });
  dt.append(ed);
  const confirmBox = h("span",{hidden:true}, "Remove this place for everyone? ",
    h("button",{class:"btn danger", onclick:() => deletePlace(p.id)},"Remove"), h("button",{class:"btn", onclick:() => { confirmBox.hidden = true; delBtn.hidden = false; }},"Keep"));
  const delBtn = h("button",{class:"btn danger", onclick:() => { delBtn.hidden = true; confirmBox.hidden = false; }},"Remove place");
  dt.append(h("div",{class:"btns"}, h("button",{class:"btn", onclick:() => startDrop(p.id)}, p.lng == null ? "Drop pin on map" : "Move pin"), delBtn, confirmBox));
  const who = [p.byName ? "Added by " + p.byName + (p.at ? " " + ago(p.at) : "") : null, p.editedByName ? "Last changed by " + p.editedByName + " " + ago(p.editedAt) : null].filter(Boolean).join(" · ");
  if (who) dt.append(h("div",{style:"margin-top:14px;font-size:12px;color:var(--muted)"}, who));
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
  if (target === "photo") { updateDoc(doc(db,"photos",dropPhoto), {lat:ll[1], lng:ll[0], src:"manual"}).catch(() => banner("Couldn't move that photo.")); return; }
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
  try { await updateDoc(doc(db,"places",id), {...patch, editedBy:me.uid, editedByName:me.name, editedAt:new Date().toISOString()}); }
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
// where each car sleeps, in order, with nights; tap to see it on the map
const fmtD = new Intl.DateTimeFormat("en-US",{timeZone:TZ, weekday:"short", month:"short", day:"numeric"});
function stayRows(){
  const rows = [];
  for (const g of ["family","friends"]) {
    const plan = PLAN()[g];
    for (let i=0;i<plan.length;i++) {
      const s = plan[i], k = s.stay; if (!k) continue;
      const prev = plan[i-1], from = prev?.drive ? T(prev.at) + DRIVES()[prev.drive].sec * SLOW * 1000 : START;
      const nxt = plan.slice(i+1).find(x => x.drive);
      const to = nxt ? T(nxt.at) : END;
      const nights = Math.round((dayStart(to) - dayStart(from)) / 864e5);
      if (nights < 1) continue;   // not sleeping there (start point, or home at the end)
      rows.push({g, k, from, to, nights});
    }
  }
  return rows.sort((a,b) => a.from - b.from);
}
function viewStays(){
  const rows = stayRows();
  const box = h("div",{class:"locbox", style:"margin-top:4px"}, h("div",{class:"st"}, h("b",null,"Where we sleep. "), "Tap one to see it on the map."));
  for (const r of rows) {
    const st = STAYS()[r.k];
    box.append(h("button",{class:"crow stayrow", onclick:() => goStay(r.k)},
      h("i",{class:"dot", style:`background:var(${G()[r.g].color})`}),
      h("span",{class:"cn"}, h("b",null, st.short || st.name), h("br"), h("span",{class:"cm"}, fmtD.format(r.from) + " to " + fmtD.format(r.to))),
      h("span",{class:"cm"}, r.nights ? r.nights + (r.nights === 1 ? " night" : " nights") : "")));
  }
  return box;
}
const dayStart = tm => T(dayKey(tm) + "T00:00");
// a house or hotel: address, who sleeps there and when, and what's planned there
function viewStay(){
  const k = selStay, s = STAYS()[k];
  if (!s) return [h("div",{class:"empty"}, "That stay isn't in the plan anymore.")];
  const out = [h("button",{class:"back", onclick:() => setTab("plan")},"← Drive plan")];
  const addr = s.name.startsWith((s.short || "") + ", ") ? s.name.slice(s.short.length + 2) : s.name;
  out.push(h("div",{class:"dt"}, h("h2",null, s.short || s.name),
    h("div",{style:"color:var(--muted);font-size:14px;margin:2px 0 12px"}, (s.model === "hotel" ? "Hotel" : s.model === "house" ? "House" : "Stay") + " · " + addr)));
  const rows = stayRows().filter(r => r.k === k);
  const box = h("div",{class:"locbox"}, h("div",{class:"st"}, h("b",null,"Who sleeps here")));
  if (!rows.length) box.append(h("div",{class:"mt"}, "Start and end point. Nobody sleeps here on the trip."));
  for (const r of rows) box.append(h("div",{class:"crow stayrow", style:"cursor:default"},
    h("i",{class:"dot", style:`background:var(${G()[r.g].color})`}),
    h("span",{class:"cn"}, h("b",null, G()[r.g].label), h("br"), h("span",{class:"cm"}, fmtD.format(r.from) + " to " + fmtD.format(r.to))),
    h("span",{class:"cm"}, r.nights + (r.nights === 1 ? " night" : " nights"))));
  out.push(box);
  const here = places.filter(p => p.lng != null && hav(s.ll, [p.lng, p.lat]) < 0.15);
  if (here.length) {
    out.push(h("div",{class:"dayhead"}, "Planned here"));
    for (const p of here.sort((a,b) => (a.day||"9").localeCompare(b.day||"9"))) out.push(h("button",{class:"crow", onclick:() => openPlace(p.id)},
      h("span",{class:"ct"}, p.day ? dayName(p.day).split(",")[0] : "Any day"), h("span",{class:"cn"}, p.name), h("span",{class:"cm"}, p.status)));
  }
  out.push(h("div",{class:"btns"},
    h("button",{class:"btn primary", onclick:() => flyTo(s.ll, 700)}, "Zoom in"),
    h("a",{class:"btn", href:"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.name), target:"_blank", rel:"noopener"}, "Directions")));
  return out;
}
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
        rows.push({sort:T(s.at), el:h("div",{class:"crow"}, h("span",{class:"ct"}, fmtT.format(T(s.at))), h("span",{class:"cn"}, ...shieldsFor(dr.road), " Drive to ", h("button",{class:"slink", onclick:() => goStay(s.to)}, STAYS()[s.to].short || STAYS()[s.to].name)), h("span",{class:"cm"}, dr.mi + " mi"))});
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
        rows.length ? rows.map(r => r.el) : h("div",{class:"crow muted"}, "Free day at ", h("button",{class:"slink", onclick:() => goStay(stayOn(g, T(d + "T12:00")))}, st.short || st.name))));
    }
    const det = h("details",{class:"cart", style:`border-left-color:var(${G()[g].color})`, open:openCars.has(g)}, sum, body);
    det.addEventListener("toggle", () => { det.open ? openCars.add(g) : openCars.delete(g); });
    box.append(det);
  }
  out.push(box);
  out.push(viewStays());
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

/* ===================== shared trip photos ===================== */
// Each photo: Firestore photos/{id} (who, when, where, urls, a tiny round marker image)
// + Firebase Storage photos/{id}/full.jpg (download size) and thumb.jpg (gallery size).
let photos = [], photoDS = null, showPhotos = true, uploads = [], pvId = null;
try { showPhotos = localStorage.getItem("showPhotos") !== "0"; } catch {}
let myCar = "family";
try { myCar = localStorage.getItem("myCar") || "family"; } catch {}
const storage = getStorage(fb);

function initPhotoLayer(){
  const Cesium = C();
  photoDS = new Cesium.CustomDataSource("photos");
  viewer.dataSources.add(photoDS);
  photoDS.show = showPhotos;
  const cl = photoDS.clustering;
  cl.enabled = true; cl.pixelRange = 30; cl.minimumClusterSize = 3;
  cl.clusterEvent.addEventListener((list, cluster) => {
    cluster.label.show = false; cluster.billboard.show = true;
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="104" height="44" viewBox="0 0 104 44"><rect x="2" y="2" width="100" height="40" rx="20" fill="#ffffff" stroke="#17221d" stroke-width="3"/><text x="52" y="28" text-anchor="middle" font-family="Atkinson Hyperlegible, Arial, sans-serif" font-size="18" font-weight="700" fill="#17221d">📷 ${list.length}</text></svg>`;
    cluster.billboard.image = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    cluster.billboard.width = 78; cluster.billboard.height = 33;
    cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    cluster.billboard.id = list;
  });
}
function syncPhotoMarkers(){
  if (!photoDS) return;
  const Cesium = C();
  photoDS.entities.removeAll();
  for (const p of photos) {
    if (needsSpot(p) || !p.marker) continue;
    photoDS.entities.add({position:Cesium.Cartesian3.fromDegrees(p.lng, p.lat), properties:{photoId:p.id},
      billboard:{image:p.marker, width:40, height:40, heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance:Number.POSITIVE_INFINITY, verticalOrigin:Cesium.VerticalOrigin.BOTTOM}});
  }
  viewer.scene.requestRender();
}
function togglePhotos(){
  showPhotos = !showPhotos;
  try { localStorage.setItem("showPhotos", showPhotos ? "1" : "0"); } catch {}
  if (photoDS) photoDS.show = showPhotos;
  $("#photoBtn").setAttribute("aria-pressed", String(showPhotos));
  viewer?.scene.requestRender();
}

/* image helpers */
async function decodeImage(file){
  try { return await createImageBitmap(file, {imageOrientation:"from-image"}); }
  catch { throw new Error("This photo format can't be opened in the browser. On iPhone, pick it from Photos (it converts automatically); on a computer, save it as JPG first."); }
}
function toJpeg(bmp, maxSide, quality){
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width*k); c.height = Math.round(bmp.height*k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res({blob:b, w:c.width, h:c.height}) : rej(new Error("Couldn't shrink the photo.")), "image/jpeg", quality));
}
function markerDataUrl(bmp, ring){
  const S = 80, c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d"), side = Math.min(bmp.width, bmp.height);
  x.beginPath(); x.arc(S/2, S/2, S/2 - 6, 0, Math.PI*2); x.closePath(); x.save(); x.clip();
  x.drawImage(bmp, (bmp.width - side)/2, (bmp.height - side)/2, side, side, 0, 0, S, S); x.restore();
  x.lineWidth = 7; x.strokeStyle = ring; x.beginPath(); x.arc(S/2, S/2, S/2 - 5, 0, Math.PI*2); x.stroke();
  return c.toDataURL("image/png");
}
async function readMeta(file){
  const out = {lat:null, lng:null, taken:null};
  try {
    if (window.exifr) {
      const d = await window.exifr.parse(file).catch(() => null);
      if (d && isFinite(d.latitude) && isFinite(d.longitude)) { out.lat = d.latitude; out.lng = d.longitude; }
      const dt = d?.DateTimeOriginal || d?.CreateDate;
      if (dt instanceof Date && !isNaN(dt)) out.taken = dt.getTime();
    }
  } catch {}
  if (!out.taken && file.lastModified) out.taken = file.lastModified;
  return out;
}

async function uploadOne(file, item){
  item.state = "Reading…"; renderUploads();
  const meta = await readMeta(file);
  let lat = meta.lat, lng = meta.lng, src = "gps";
  if (lat == null) {
    // no location in the photo. Taken during the trip: use where this car was then.
    // Otherwise don't guess; the person places it on the map.
    const when = meta.taken && meta.taken >= START && meta.taken <= END ? meta.taken : null;
    if (when) { const c = carAt(myCar, when); lat = c.ll[1]; lng = c.ll[0]; src = "timeline"; }
    else src = "none";
  }
  const bmp = await decodeImage(file);
  item.state = "Shrinking…"; renderUploads();
  const full = await toJpeg(bmp, 2560, 0.86), thumb = await toJpeg(bmp, 520, 0.8);
  const marker = markerDataUrl(bmp, gcol(myCar));
  const id = doc(collection(db, "photos")).id;
  const stamp = new Date(meta.taken || Date.now());
  const fname = "trip-" + stamp.toISOString().slice(0,10) + "-" + id.slice(0,5) + ".jpg";
  item.state = "Uploading…"; renderUploads();
  const fr = sref(storage, `photos/${id}/full.jpg`), tr = sref(storage, `photos/${id}/thumb.jpg`);
  await uploadBytes(fr, full.blob, {contentType:"image/jpeg", contentDisposition:`attachment; filename="${fname}"`, cacheControl:"public,max-age=31536000"});
  await uploadBytes(tr, thumb.blob, {contentType:"image/jpeg", cacheControl:"public,max-age=31536000"});
  const [fullUrl, thumbUrl] = await Promise.all([getDownloadURL(fr), getDownloadURL(tr)]);
  await setDoc(doc(db, "photos", id), {by:me.uid, byName:me.name, car:myCar, at:new Date().toISOString(), taken:meta.taken || null,
    lat, lng, src, w:full.w, h:full.h, fullUrl, thumbUrl, marker, caption:"", fname});
  if (src === "none") { item.state = "✓ Added, no location"; item.needId = id; }
  else item.state = "✓ Added"; renderUploads();
}
async function uploadFiles(files){
  const list = [...files].map(f => ({name:f.name, state:"Waiting"}));
  uploads = list.concat(uploads).slice(0, 30); renderUploads();
  for (let i=0;i<files.length;i++) {
    try { await uploadOne(files[i], list[i]); }
    catch (e) { list[i].state = "✗ " + (e.code === "storage/unauthorized" ? "Not allowed. Rejoin with the passcode." : e.code === "storage/quota-exceeded" ? "Photo storage is full." : (e.message || "Upload failed")); renderUploads(); }
  }
}
function renderUploads(){
  const box = $("#uploadList"); if (!box) return;
  box.replaceChildren(...uploads.slice(0, 8).map(u => {
    const need = u.needId && needsSpot(photos.find(x => x.id === u.needId) || {});
    return h("div",{class:"urow"}, h("span",{class:"cn"}, u.name), h("span",{class:"cm"}, u.state),
      need ? h("button",{class:"btn primary", style:"padding:5px 10px;font-size:13px", onclick:() => placePhoto(u.needId)}, "Place it on the map") : null);
  }));
}

const needsSpot = p => p.lng == null || p.src === "now" || p.src === "none";
function placePhoto(id){ closePhoto(); dropPhoto = id; startDrop("photo"); $("#dropBar").firstChild.textContent = "Tap the map where this photo was taken. "; }
/* Photos tab */
function viewPhotos(){
  const out = [];
  const carSel = h("select",{id:"myCar"}, ...["family","friends"].map(g => h("option",{value:g, selected:myCar === g}, G()[g].label)));
  carSel.onchange = () => { myCar = carSel.value; try { localStorage.setItem("myCar", myCar); } catch {} };
  const fileIn = h("input",{type:"file", accept:"image/*", multiple:true, id:"photoFiles", hidden:true});
  fileIn.onchange = () => { const fs = [...fileIn.files]; fileIn.value = ""; if (fs.length) uploadFiles(fs); };
  out.push(h("div",{class:"locbox"},
    h("div",{class:"st"}, h("b",null,"Add trip photos. "), "They land on the map where they were taken. Everyone on the trip can see and download them."),
    h("label",{class:"f"},"Whose camera", carSel),
    h("button",{type:"button", class:"btn primary", style:"justify-content:center;padding:11px", onclick:() => fileIn.click()}, "📷  Choose photos"),
    fileIn, h("div",{id:"uploadList", style:"display:grid;gap:2px"})));
  setTimeout(renderUploads);
  if (!photos.length) { out.push(h("div",{class:"empty"}, h("b",null,"No photos yet"), "The first one you add shows up here and on the map.")); return out; }
  const groups = {};
  for (const p of photos) (groups[p.taken ? dayKey(p.taken) : "unknown"] ||= []).push(p);
  const keys = Object.keys(groups).sort();
  out.push(h("div",{class:"dayhead",style:"margin-top:14px"}, photos.length + " photo" + (photos.length === 1 ? "" : "s")));
  const need = photos.filter(p => needsSpot(p) && p.by === me.uid).length;
  if (need) out.push(h("div",{class:"notice"}, need + (need === 1 ? " of your photos has" : " of your photos have") + " no location. Tap one marked Needs a spot, then Place on map."));
  for (const k of keys) {
    const list = groups[k].sort((a,b) => (a.taken||0) - (b.taken||0));
    out.push(h("div",{class:"dayhead"}, (k === "unknown" ? "No date" : dayName(k)) + " · " + list.length));
    out.push(h("div",{class:"pgrid"}, ...list.map(p => h("button",{class:"pthumb", onclick:() => openPhoto(p.id), "aria-label":"Open photo"},
      h("img",{src:p.thumbUrl, alt:p.caption || "Trip photo", loading:"lazy"}), h("i",{style:`background:var(${G()[p.car]?.color || "--both"})`}),
      needsSpot(p) ? h("span",{class:"need"}, "Needs a spot") : null))));
  }
  return out;
}

/* full-screen photo viewer */
function openPhoto(id){ pvId = id; renderPhotoViewer(); }
function closePhoto(){ pvId = null; $("#pv").hidden = true; }
function renderPhotoViewer(){
  const p = photos.find(x => x.id === pvId), box = $("#pv");
  if (!p) { closePhoto(); return; }
  const i = photos.indexOf(p);
  const srcTxt = p.src === "gps" ? "Pinned by photo location" : p.src === "timeline" ? "Pinned where the car was then" : p.src === "manual" ? "Placed by hand" : "Not on the map yet";
  const cap = h("input",{id:"pvCap", value:p.caption || "", placeholder:"Add a caption", maxlength:"140"});
  cap.onchange = () => updateDoc(doc(db,"photos",p.id), {caption:cap.value.trim()}).catch(() => {});
  const confirmBox = h("span",{hidden:true}, "Delete for everyone? ",
    h("button",{class:"btn danger", onclick:() => deletePhoto(p)},"Delete"), h("button",{class:"btn", onclick:() => { confirmBox.hidden = true; delBtn.hidden = false; }},"Keep"));
  const delBtn = h("button",{class:"btn danger", onclick:() => { delBtn.hidden = true; confirmBox.hidden = false; }}, "Delete");
  box.replaceChildren(h("div",{class:"pvcard"},
    h("div",{class:"pvtop"}, h("button",{class:"btn", onclick:closePhoto}, "✕ Close"),
      h("span",{style:"flex:1"}),
      h("button",{class:"btn", disabled:i <= 0, onclick:() => openPhoto(photos[i-1].id)}, "‹"),
      h("button",{class:"btn", disabled:i >= photos.length - 1, onclick:() => openPhoto(photos[i+1].id)}, "›")),
    h("img",{class:"pvimg", src:p.fullUrl, alt:p.caption || "Trip photo"}),
    cap,
    h("div",{class:"mt",style:"font-size:13px;color:var(--muted)"},
      [p.byName ? "By " + p.byName : null, p.taken ? fmtDT.format(p.taken) : null, srcTxt].filter(Boolean).join(" · ")),
    h("div",{class:"btns"},
      h("a",{class:"btn primary", href:p.fullUrl, target:"_blank", rel:"noopener"}, "⬇ Download"),
      needsSpot(p) ? null : h("button",{class:"btn", onclick:() => { closePhoto(); flyTo([p.lng, p.lat], 900); }}, "Show on map"),
      h("button",{class:needsSpot(p) ? "btn primary" : "btn", onclick:() => placePhoto(p.id)}, needsSpot(p) ? "Place on map" : "Move pin"),
      p.by === me.uid ? delBtn : null, confirmBox)));
  box.hidden = false;
}
let dropPhoto = null;
async function deletePhoto(p){
  try {
    await deleteDoc(doc(db,"photos",p.id));
    await Promise.allSettled([deleteObject(sref(storage, `photos/${p.id}/full.jpg`)), deleteObject(sref(storage, `photos/${p.id}/thumb.jpg`))]);
    closePhoto();
  } catch (e) { banner("Couldn't delete that photo (" + (e.code || "error") + ")."); }
}


/* ===================== first-time tour ===================== */
// 5 quick pop-ups that point at the real buttons. Shows once per device; "How it works" replays it.
const TOUR = [
  {el:"#map", sheet:false, title:"This is the trip board",
    text:"Pink is the Roques, blue is the Hanleys. Hollow pins are ideas. 3D pieces are confirmed stops and where we sleep. Press ▶ at the bottom to watch both cars drive the week."},
  {el:"#tabAdd", sheet:true, title:"Add a place",
    text:"Search Google or drop a pin on the map. Mark it Idea, Maybe or Confirmed so everyone knows where it stands."},
  {el:"#tabPlaces", sheet:true, title:"See every idea",
    text:"Everything both cars added, by city, type or day. Drive plan shows miles per day and where we sleep."},
  {el:"#tabPhotos", sheet:true, title:"Share photos",
    text:"Add photos from your phone. They land on the map where you took them, and anyone can download them."},
  {el:"#goBtn", sheet:false, title:"Get around fast",
    text:"Go to follows a car, zooms to today or shows the whole trip. Near me puts you on the map."}
];
let tourI = -1;
function startTour(){ tourI = 0; showTour(); }
function endTour(){
  tourI = -1; $("#tour").hidden = true;
  if (!store.get("lastVisit")) markNewsSeen();
  try { localStorage.setItem("tourDone", "1"); } catch {}
  if (matchMedia("(max-width: 820px)").matches) toggleSheet(false);
}
function showTour(){
  const s = TOUR[tourI], box = $("#tour");
  if (matchMedia("(max-width: 820px)").matches) toggleSheet(s.sheet);
  goMenu(false);
  box.hidden = false;
  const last = tourI === TOUR.length - 1;
  const card = h("div",{class:"tcard", role:"dialog", "aria-labelledby":"tTitle"},
    h("div",{class:"tstep"}, (tourI + 1) + " of " + TOUR.length),
    h("h3",{id:"tTitle"}, s.title), h("p",null, s.text),
    h("div",{class:"tbtns"},
      h("button",{class:"btn", onclick:endTour}, last ? "Close" : "Skip"),
      h("span",{style:"flex:1"}),
      tourI > 0 ? h("button",{class:"btn", onclick:() => { tourI--; showTour(); }}, "Back") : null,
      h("button",{class:"btn primary", id:"tNext", onclick:() => { if (last) endTour(); else { tourI++; showTour(); } }}, last ? "Let's go" : "Next")));
  const ring = h("div",{class:"tring"});
  box.replaceChildren(ring, card);
  // wait for the sheet to slide, then place the ring and the card next to the target
  setTimeout(() => {
    const r = $(s.el).getBoundingClientRect(), pad = 6, vw = innerWidth, vh = innerHeight;
    const big = r.width > vw * 0.5 && r.height > vh * 0.4;
    Object.assign(ring.style, big ? {left:r.left + 14 + "px", top:r.top + 14 + "px", width:r.width - 28 + "px", height:r.height - 28 + "px"}
      : {left:r.left - pad + "px", top:r.top - pad + "px", width:r.width + pad*2 + "px", height:r.height + pad*2 + "px"});
    const cw = Math.min(340, vw - 32), ch = card.offsetHeight;
    let left = big ? r.left + (r.width - cw)/2 : Math.min(Math.max(16, r.left + r.width/2 - cw/2), vw - cw - 16);
    let top = big ? r.top + r.height/2 - ch/2 : (r.bottom + 14 + ch < vh ? r.bottom + 14 : Math.max(16, r.top - ch - 14));
    if (!big && r.right + 16 + cw < vw && r.height > 30 && r.left < vw/3) { left = r.right + 16; top = Math.max(16, Math.min(r.top, vh - ch - 16)); }
    Object.assign(card.style, {left:left + "px", top:top + "px", width:cw + "px"});
    $("#tNext").focus();
  }, 320);
}
document.addEventListener("keydown", e => { if (tourI >= 0 && e.key === "Escape") endTour(); });
$("#helpBtn").onclick = () => startTour();
addEventListener("resize", () => { if (tourI >= 0) showTour(); });



/* ===================== activity: who's been on, what changed ===================== */
let presence = [];
const ago = iso => {
  const ms = Date.now() - new Date(iso).getTime(); if (!isFinite(ms)) return "";
  const m = Math.round(ms / 60000);
  if (m < 2) return "just now"; if (m < 60) return m + " min ago";
  const hr = Math.round(m / 60); if (hr < 24) return hr + (hr === 1 ? " hour ago" : " hours ago");
  const d = Math.round(hr / 24); if (d < 14) return d + (d === 1 ? " day ago" : " days ago");
  return "on " + new Intl.DateTimeFormat("en-US",{month:"short", day:"numeric"}).format(new Date(iso));
};
let lastPing = 0;
function pingPresence(joined){
  if (!me.uid || Date.now() - lastPing < 5*60e3) return;
  lastPing = Date.now();
  const data = {name:me.name || "", lastSeen:new Date().toISOString()};
  if (joined) data.joined = joined;
  setDoc(doc(db,"presence",me.uid), data, {merge:true}).catch(() => {});
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pingPresence(); });
function viewActivity(){
  const out = [];
  const ppl = h("div",{class:"locbox"}, h("div",{class:"st"}, h("b",null,"Who's been on")));
  if (!presence.length) ppl.append(h("div",{class:"mt", style:"color:var(--muted);font-size:13px"}, "Nobody yet. People show up here the next time they open the trip."));
  for (const x of [...presence].sort((a,b) => (b.lastSeen||"").localeCompare(a.lastSeen||""))) {
    const fresh = Date.now() - new Date(x.lastSeen).getTime() < 10*60e3;
    ppl.append(h("div",{class:"urow"},
      h("span",{class:"cn"}, h("i",{class:"live" + (fresh ? " on" : "")}), h("b",null, x.name || "Someone"), x.id === me.uid ? " (you)" : ""),
      h("span",{class:"cm"}, fresh ? "on now" : ago(x.lastSeen))));
  }
  out.push(ppl);
  // recent changes from everyone: places added or changed, photos added
  const ev = [];
  for (const p of places) {
    if (p.at && p.byName && p.by) ev.push({at:p.at, who:p.byName, what:"added", name:p.name, open:() => openPlace(p.id), p});
    if (p.editedAt && p.editedByName && p.editedAt !== p.at) ev.push({at:p.editedAt, who:p.editedByName, what:"changed", name:p.name, open:() => openPlace(p.id), p});
  }
  for (const ph of photos) if (ph.at) ev.push({at:ph.at, who:ph.byName || "Someone", what:"added a photo", name:ph.caption || "", open:() => openPhoto(ph.id)});
  ev.sort((a,b) => b.at.localeCompare(a.at));
  out.push(h("div",{class:"dayhead"}, "Recent changes"));
  if (!ev.length) out.push(h("div",{class:"empty"}, "No changes yet."));
  for (const e of ev.slice(0, 30)) out.push(h("button",{class:"crow actrow", onclick:e.open},
    h("span",{class:"ct"}, ago(e.at)),
    h("span",{class:"cn"}, h("b",null, e.who), " " + e.what + (e.name ? " " : ""), e.name ? h("span",null, e.name) : null)));
  return out;
}

/* ===================== what's new ===================== */
// Shown once per device when something new lands: a new game piece (listed here when Claude adds one)
// and places other people added since this phone or computer last opened the trip.
const NEWS = [
  {id:"piece-oslovar-2", stayKey:"sc", img:"models/oslovar.jpg", name:"Oslovar House",
    text:"The Oslovar House has a brand-new game piece. Tap it to see it up close."},
  {id:"piece-labicyclette", placeId:"labicyclette", img:"models/labicyclette.jpg", name:"La Bicyclette",
    text:"The Carmel bistro now stands on the board as its own game piece. Tap it to see it up close."}
];
const store = {get:k => { try { return localStorage.getItem(k); } catch { return null; } }, set:(k,v) => { try { localStorage.setItem(k, v); } catch {} }};
function seenNews(){ try { return JSON.parse(store.get("seenNews") || "[]"); } catch { return []; } }
function markNewsSeen(){ store.set("seenNews", JSON.stringify(NEWS.map(n => n.id))); store.set("lastVisit", new Date().toISOString()); }
function maybeShowNews(){
  if (tourI >= 0 || !$("#pv").hidden) return;
  const last = store.get("lastVisit");
  const seen = seenNews();
  const pieces = NEWS.filter(n => !seen.includes(n.id) && (n.stayKey ? STAYS()[n.stayKey] : places.some(p => p.id === n.placeId)));
  // places someone else added since this device's last visit (imported trip places have no author, so they don't count)
  const added = last ? places.filter(p => p.by && p.by !== me.uid && p.at && p.at > last).sort((a,b) => b.at.localeCompare(a.at)) : [];
  if (!last && store.get("tourDone") !== "1") { markNewsSeen(); return; }   // brand-new on this device: the tour covers it
  if (!pieces.length && !added.length) { store.set("lastVisit", new Date().toISOString()); return; }
  const close = () => { $("#news").hidden = true; markNewsSeen(); };
  const go = id => { close(); openPlace(id); };
  const card = h("div",{class:"ncard", role:"dialog", "aria-labelledby":"nTitle"},
    h("div",{class:"tstep"}, "Since you were last here"),
    h("h3",{id:"nTitle"}, pieces.length ? (pieces.length === 1 ? "A new piece has arrived" : pieces.length + " new pieces have arrived") : "What's new"));
  for (const n of pieces) card.append(h("button",{class:"npiece", onclick:() => n.stayKey ? (close(), openStay(n.stayKey)) : go(n.placeId)},
    h("img",{src:n.img, alt:"Game piece for " + n.name}),
    h("span",null, h("b",null, n.name), n.text, h("span",{class:"ngo"}, "Show me on the board →"))));
  if (added.length) {
    card.append(h("div",{class:"dayhead", style:"margin:12px 0 4px"}, added.length + (added.length === 1 ? " new place" : " new places")));
    for (const p of added.slice(0, 5)) card.append(h("button",{class:"crow", onclick:() => go(p.id)},
      icon(p), h("span",{class:"cn"}, p.name), h("span",{class:"cm"}, p.byName ? "by " + p.byName : p.status)));
    if (added.length > 5) card.append(h("div",{class:"mt", style:"color:var(--muted);font-size:13px;margin-top:4px"}, "And " + (added.length - 5) + " more in Places."));
  }
  card.append(h("div",{class:"tbtns", style:"margin-top:14px"}, h("span",{style:"flex:1"}), h("button",{class:"btn primary", id:"nOk", onclick:close}, "Got it")));
  const box = $("#news"); box.replaceChildren(card); box.hidden = false;
  box.onclick = e => { if (e.target === box) close(); };
  $("#nOk").focus();
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#news").hidden) { $("#news").hidden = true; markNewsSeen(); } });

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
    onSnapshot(collection(db,"presence"), s => {
      presence = s.docs.map(d => ({id:d.id, ...d.data()}));
      if (tab === "activity") render();
    }, () => {});
    pingPresence(window.__joined);
    onSnapshot(collection(db,"photos"), s => {
      photos = s.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => (a.taken||0) - (b.taken||0));
      syncPhotoMarkers();
      if (tab === "photos") render();
      if (pvId) renderPhotoViewer();
    }, e => { if (e.code !== "permission-denied") banner("Photos stopped updating (" + e.code + ")."); });
    onSnapshot(doc(db,"trip","main"), s => {
      if (!s.exists()) return;
      TRIP = s.data(); START = T(TRIP.start); END = T(TRIP.end); DAYS = TRIP.days;
      buildRoutes(); buildDays(); drawLegend();
      if (viewer) { drawRoutes(); drawStays(); drawCars(); syncPins(); }
      render(); tick(false);
      let seen = false; try { seen = localStorage.getItem("tourDone") === "1"; } catch {}
      if (!seen && tourI < 0 && !window.__tourQueued) { window.__tourQueued = true; setTimeout(startTour, 1800); }
      else if (seen && !window.__newsQueued) { window.__newsQueued = true; setTimeout(maybeShowNews, 2200); }
    });
  }
  render(); tick(false);
}
async function gate(user){
  me.uid = user.uid;
  const m = await getDoc(doc(db,"members",user.uid)).catch(() => null);
  if (m && m.exists()) { me.name = m.data().name || ""; try { window.__joined = m.data().at?.toDate?.().toISOString(); } catch {} $("#gate").hidden = true; await loadTrip(); return; }
  $("#gate").hidden = false;
  $("#gName").focus();
}
$("#gateForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#gName").value.trim(), code = $("#gCode").value.trim();
  $("#gBtn").disabled = true; $("#gMsg").textContent = "Checking…";
  try {
    await setDoc(doc(db,"members",me.uid), {code, name, at:serverTimestamp()});
    me.name = name; window.__joined = new Date().toISOString(); $("#gate").hidden = true; $("#gMsg").textContent = "";
    await loadTrip();
  } catch (err) {
    $("#gMsg").textContent = err.code === "permission-denied" ? "That passcode doesn't match. Check the text from Olaf and try again." : "Couldn't connect (" + (err.code || "error") + "). Try again.";
  } finally { $("#gBtn").disabled = false; }
});

initMap().then(() => { if (TRIP) { drawRoutes(); drawStays(); drawCars(); syncPins(); } });
onAuthStateChanged(auth, user => { if (user) gate(user); });
signInAnonymously(auth).catch(e => { $("#gate").hidden = false; $("#gMsg").textContent = "Sign-in is turned off (" + e.code + "). Olaf: enable Anonymous sign-in in Firebase."; });
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (TRIP && viewer) { drawRoutes(); drawCars(); for (const [,v] of ents.pins) v.sig = ""; syncPins(); } }); } catch {}
