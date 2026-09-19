import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Compass, Eye, EyeOff, Layers, Lock, Maximize2, Minimize2, RotateCw, Unlock, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Satellite } from '../../types';
import { STATIONS } from '../../data/fleet';
import { isSunlit, periodMinutes, propagate } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { PLACES } from '../../orbit/places';
import { Conjunction, ObjectKind, SpaceObject, findConjunctions, generateDebris } from '../../orbit/debris';
import { toast } from '../../store/useToastStore';
import { SatelliteDetailCard } from './SatelliteDetailCard';

interface CesiumGlobeProps {
  satellites: Satellite[];
  onSelectSat?: (satId: string) => void;
  viewMode?: '3D' | '2D';
}

// ---- palettes ------------------------------------------------------------------------------------

type ColorMode = 'health' | 'plane' | 'satellite';
const PLANE_COLOR: Record<string, string> = { 'Plane A': '#5B8DEF', 'Plane B': '#A78BFA', 'Plane C': '#22D3EE', 'Plane D': '#F472B6' };
const HEALTH_COLOR: Record<string, string> = { NOMINAL: '#4CAF81', WARNING: '#E8943A', CRITICAL: '#C62828' };
const STATION_COLOR = ['#22D3EE', '#F472B6', '#A3E635', '#FB923C', '#C084FC', '#94A3B8'];
const PLACE_COLOR = { capital: '#FACC15', city: '#FDE68A', site: '#FB923C' } as const;
const OBJECT_COLOR: Record<ObjectKind, string> = { DEBRIS: '#9CA3AF', ROCKET_BODY: '#C4A484', DEFUNCT: '#B794F4' };
const OBJECT_LABEL: Record<ObjectKind, string> = { DEBRIS: 'Debris fragment', ROCKET_BODY: 'Rocket body', DEFUNCT: 'Defunct satellite' };
const RISK_COLOR = { CRITICAL: '#EF4444', WARNING: '#F59E0B', WATCH: '#FACC15' } as const;

/** Golden-angle hue steps keep neighbours in the list visually apart, whatever the fleet size. */
const hsl = (h: number, s: number, l: number) => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};

export function satColor(sat: Satellite, index: number, mode: ColorMode): string {
  if (mode === 'plane') return PLANE_COLOR[sat.constellation_group] ?? '#94A3B8';
  if (mode === 'satellite') return hsl((index * 137.508) % 360, 0.72, 0.62);
  return HEALTH_COLOR[sat.health_state] ?? HEALTH_COLOR.NOMINAL;
}

// ---- globe styles --------------------------------------------------------------------------------
// Every basemap here is free to use without a token. "natural" ships inside Cesium and works offline.

type BasemapId = 'satellite' | 'natural' | 'dark' | 'light' | 'topo' | 'streets' | 'night';
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services';
const BASEMAPS: Record<BasemapId, { label: string; url?: string; max: number; hint: string }> = {
  satellite: { label: 'Satellite', url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, max: 18, hint: 'Esri World Imagery' },
  natural: { label: 'Natural Earth', max: 5, hint: 'Bundled with Cesium · works offline' },
  dark: { label: 'Dark canvas', url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, max: 16, hint: 'Muted dark map, lets satellites stand out' },
  light: { label: 'Light canvas', url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, max: 16, hint: 'Muted light map' },
  topo: { label: 'Topographic', url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, max: 18, hint: 'Terrain, roads and borders' },
  streets: { label: 'Streets', url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, max: 18, hint: 'Street map' },
  night: { label: 'Night lights', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLightsAtNight2012/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg', max: 8, hint: 'NASA Earth at night' },
};

interface GlobeStyle { basemap: BasemapId; lighting: boolean; atmosphere: boolean; grid: boolean; brightness: number; saturation: number }
const DEFAULT_STYLE: GlobeStyle = { basemap: 'satellite', lighting: true, atmosphere: true, grid: false, brightness: 1, saturation: 1 };

const css = (hex: string, alpha = 1) => Cesium.Color.fromCssColorString(hex).withAlpha(alpha);

// ---- layers --------------------------------------------------------------------------------------

interface Layers { sats: boolean; orbits: boolean; labels: boolean; dropLines: boolean; stations: boolean; coverage: boolean; places: boolean; debris: boolean; conjunctions: boolean }
const DEFAULT_LAYERS: Layers = { sats: true, orbits: true, labels: true, dropLines: false, stations: true, coverage: true, places: true, debris: false, conjunctions: true };
const LAYER_LABEL: Record<keyof Layers, string> = {
  sats: 'Satellites', orbits: 'Orbit paths', labels: 'Satellite labels', dropLines: 'Drop lines to ground', stations: 'Ground stations',
  coverage: 'Station coverage', places: 'Place references', debris: 'Space debris & objects', conjunctions: 'Conjunction alerts',
};
const STORE_KEY = 'vyuh-globe-layers';
const loadLayers = (): { layers: Layers; mode: ColorMode; style: GlobeStyle } => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (v) return { layers: { ...DEFAULT_LAYERS, ...v.layers }, mode: v.mode ?? 'satellite', style: { ...DEFAULT_STYLE, ...v.style } };
  } catch { /* storage blocked or corrupt */ }
  return { layers: DEFAULT_LAYERS, mode: 'satellite', style: DEFAULT_STYLE };
};

const fmtIn = (ms: number) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };

export const CesiumGlobe: React.FC<CesiumGlobeProps> = ({ satellites, onSelectSat, viewMode = '3D' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const pointsRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const labelsRef = useRef<Cesium.LabelCollection | null>(null);
  const orbitLinesRef = useRef<Cesium.PolylineCollection | null>(null);
  const dropLinesRef = useRef<Cesium.PolylineCollection | null>(null);
  const debrisPointsRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const debrisLabelsRef = useRef<Cesium.LabelCollection | null>(null);

  const satPts = useRef(new Map<string, Cesium.PointPrimitive>());
  const satLabels = useRef(new Map<string, Cesium.Label>());
  const dropLines = useRef(new Map<string, Cesium.Polyline>());
  const debPts = useRef(new Map<string, Cesium.PointPrimitive>());
  const debLabels = useRef(new Map<string, Cesium.Label>());
  const conjLines = useRef(new Map<string, Cesium.Polyline>());
  const stationEnts = useRef<{ point: Cesium.Entity; ring: Cesium.Entity }[]>([]);
  const placeEnts = useRef<Cesium.Entity[]>([]);

  const animTimeRef = useRef(0);
  const baseMsRef = useRef(Date.now()); // wall-clock instant at which animTimeRef was 0

  const initial = useMemo(loadLayers, []);
  const [layers, setLayers] = useState<Layers>(initial.layers);
  const [colorMode, setColorMode] = useState<ColorMode>(initial.mode);
  const [style, setStyle] = useState<GlobeStyle>(initial.style);
  const baseLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const lockApplied = useRef(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [selectedSatId, setSelectedSatId] = useState('');
  const [focusSat, setFocusSat] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Conjunction | null>(null);
  const [showInspector, setShowInspector] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [orbitRefresh, setOrbitRefresh] = useState(0);
  const [counts, setCounts] = useState({ sunlit: 0, eclipse: 0 });

  const onNavigateRef = useRef(onSelectSat);
  onNavigateRef.current = onSelectSat;

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ layers, mode: colorMode, style })); } catch { /* ignore */ }
  }, [layers, colorMode, style]);

  // The parent hands over a fresh array every tick; everything expensive keys off the ids instead.
  const satsRef = useRef(satellites);
  satsRef.current = satellites;
  const satKey = satellites.map((s) => s.sat_id).join(',');
  const healthKey = satellites.map((s) => s.health_state[0]).join('');
  const indexOf = useMemo(() => new Map(satsRef.current.map((s, i) => [s.sat_id, i])), [satKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorOf = useCallback((s: Satellite) => satColor(s, indexOf.get(s.sat_id) ?? 0, colorMode), [indexOf, colorMode]);
  const activeSat = satellites.find((s) => s.sat_id === selectedSatId) || satellites[0];

  // ---- space objects and conjunction screening -----------------------------------------------------
  const satRefs = useMemo(() => satsRef.current.map((s) => ({ id: s.sat_id, el: satElements(s) })), [satKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const objects: SpaceObject[] = useMemo(() => generateDebris(satRefs, Date.now()), [satRefs]);
  const objectById = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const [conjunctions, setConjunctions] = useState<Conjunction[]>([]);
  const screening = layers.debris || layers.conjunctions;
  useEffect(() => {
    if (!screening) return;
    let alive = true;
    const run = () => { const c = findConjunctions(satRefs, objects, Date.now(), 4 * 3600_000, 25); if (alive) setConjunctions(c); };
    const first = window.setTimeout(run, 800); // after the first paint: screening takes a few hundred ms
    const again = window.setInterval(run, 10 * 60_000);
    return () => { alive = false; clearTimeout(first); clearInterval(again); };
  }, [satRefs, objects, screening]);

  const alerted = useRef(new Set<string>());
  useEffect(() => {
    const fresh = conjunctions.filter((c) => c.risk === 'CRITICAL' && !alerted.current.has(`${c.satId}:${c.objectId}`));
    fresh.forEach((c) => alerted.current.add(`${c.satId}:${c.objectId}`));
    if (fresh.length === 1) {
      const c = fresh[0];
      toast.critical(`Conjunction: ${c.satId} and ${c.objectName}`, {
        body: `Miss distance ${c.missKm.toFixed(1)} km in ${fmtIn(c.tcaMs - Date.now())}, closing at ${c.relSpeedKms.toFixed(1)} km/s.`, key: 'conjunction',
        action: { label: 'Open fleet overview', route: 'fleet' },
      });
    } else if (fresh.length > 1) {
      toast.critical(`${fresh.length} critical conjunctions (under 5 km)`, {
        body: fresh.slice(0, 3).map((c) => `${c.satId} × ${c.objectName}: ${c.missKm.toFixed(1)} km in ${fmtIn(c.tcaMs - Date.now())}`).join(' · '), key: 'conjunction',
        action: { label: 'Open fleet overview', route: 'fleet' },
      });
    }
  }, [conjunctions]);

  const shownConj = useMemo(() => conjunctions.filter((c) => !focusSat || c.satId === focusSat), [conjunctions, focusSat]);
  const conjObjectIds = useMemo(() => new Set(shownConj.slice(0, 6).map((c) => c.objectId)), [shownConj]);

  // ---- viewer ------------------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    Cesium.Ion.defaultAccessToken = '';

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: false, animation: false, timeline: false, baseLayerPicker: false, fullscreenButton: false, geocoder: false,
      homeButton: false, infoBox: false, selectionIndicator: false, navigationHelpButton: false, sceneModePicker: false,
      scene3DOnly: false, shadows: false,
    });
    const scene = viewer.scene;
    scene.backgroundColor = css('#0C0D10');
    if (scene.globe) {
      scene.globe.show = true;
      scene.globe.baseColor = css('#14161B');
    }

    pointsRef.current = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    labelsRef.current = scene.primitives.add(new Cesium.LabelCollection());
    orbitLinesRef.current = scene.primitives.add(new Cesium.PolylineCollection());
    dropLinesRef.current = scene.primitives.add(new Cesium.PolylineCollection());
    debrisPointsRef.current = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    debrisLabelsRef.current = scene.primitives.add(new Cesium.LabelCollection());

    // Ground stations, each in its own colour, with a coverage ring (about 10° elevation mask at 525 km).
    stationEnts.current = STATIONS.map((st, i) => {
      const color = STATION_COLOR[i % STATION_COLOR.length];
      const pos = Cesium.Cartesian3.fromDegrees(st.lon, st.lat, 0);
      const point = viewer.entities.add({
        position: pos,
        point: { pixelSize: 11, color: css(color), outlineColor: css('#F3F4F6'), outlineWidth: 2 },
        label: {
          text: `${st.id} · ${st.name}`, font: '11px Inter, sans-serif', fillColor: css(color), pixelOffset: new Cesium.Cartesian2(0, -16),
          showBackground: true, backgroundColor: css('#14161B', 0.85), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      const ring = viewer.entities.add({
        position: pos,
        ellipse: { semiMajorAxis: 1_800_000, semiMinorAxis: 1_800_000, material: css(color, 0.1), outline: true, outlineColor: css(color, 0.6), outlineWidth: 1 },
      });
      return { point, ring };
    });

    // Place references.
    placeEnts.current = PLACES.map((pl) => viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pl.lon, pl.lat, 0),
      point: { pixelSize: pl.kind === 'site' ? 7 : 5, color: css(PLACE_COLOR[pl.kind]), outlineColor: css('#0C0D10'), outlineWidth: 1 },
      label: {
        text: pl.name, font: '10.5px Inter, sans-serif', fillColor: css(PLACE_COLOR[pl.kind]), pixelOffset: new Cesium.Cartesian2(0, 12),
        showBackground: true, backgroundColor: css('#0C0D10', 0.6), scale: 0.95,
      },
    }));

    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      if (viewer.isDestroyed()) return;
      const picked = scene.pick(click.position);
      const prim = picked && (picked as { primitive?: { satId?: string; objectId?: string } }).primitive;
      if (prim?.satId) { setSelectedSatId(prim.satId); setShowInspector(true); setSelectedObject(null); }
      else if (prim?.objectId) setSelectedObject(prim.objectId);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(20, 20, 16000000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-85), roll: 0 },
    });

    viewerRef.current = viewer;
    setIsLoaded(true);

    return () => {
      handler.destroy();
      for (const m of [satPts, satLabels, dropLines, debPts, debLabels, conjLines]) (m.current as Map<string, unknown>).clear();
      stationEnts.current = []; placeEnts.current = [];
      pointsRef.current = labelsRef.current = orbitLinesRef.current = dropLinesRef.current = debrisPointsRef.current = debrisLabelsRef.current = null;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) { viewerRef.current.destroy(); viewerRef.current = null; }
    };
  }, []);

  // Static layers: visibility only.
  useEffect(() => {
    stationEnts.current.forEach((s) => { s.point.show = layers.stations; s.ring.show = layers.stations && layers.coverage; });
    placeEnts.current.forEach((p) => { p.show = layers.places; });
  }, [layers.stations, layers.coverage, layers.places, isLoaded]);

  // Basemap: swapped when the choice changes; the old layer is removed only once the new one is in.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isLoaded) return;
    let cancelled = false;
    const def = BASEMAPS[style.basemap];
    (async () => {
      const provider = def.url
        ? new Cesium.UrlTemplateImageryProvider({ url: def.url, maximumLevel: def.max, credit: def.hint })
        : await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'), { fileExtension: 'jpg' });
      if (cancelled || viewer.isDestroyed()) return;
      const layer = viewer.imageryLayers.addImageryProvider(provider, 0);
      viewer.imageryLayers.lowerToBottom(layer);
      const old = baseLayerRef.current;
      baseLayerRef.current = layer;
      if (old && !viewer.isDestroyed()) viewer.imageryLayers.remove(old, true);
      layer.brightness = style.brightness;
      layer.saturation = style.saturation;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style.basemap, isLoaded]);

  // Tweaks that do not need a new layer.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isLoaded) return;
    const g = viewer.scene.globe;
    g.enableLighting = style.lighting;
    g.showGroundAtmosphere = style.atmosphere;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = style.atmosphere;
    if (baseLayerRef.current) { baseLayerRef.current.brightness = style.brightness; baseLayerRef.current.saturation = style.saturation; }
  }, [style, isLoaded]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isLoaded || !style.grid) return;
    const layer = viewer.imageryLayers.addImageryProvider(new Cesium.GridImageryProvider({
      cells: 8, color: Cesium.Color.WHITE.withAlpha(0.35), glowColor: Cesium.Color.WHITE.withAlpha(0.08), backgroundColor: Cesium.Color.TRANSPARENT, canvasSize: 256,
    }));
    return () => { if (!viewer.isDestroyed()) viewer.imageryLayers.remove(layer, true); };
  }, [style.grid, isLoaded]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    try { if (viewMode === '2D') viewer.scene.morphTo2D(1.0); else viewer.scene.morphTo3D(1.0); } catch { /* transient morph */ }
  }, [viewMode]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isAutoRotating || viewMode !== '3D' || isCameraLocked) return;
    return viewer.clock.onTick.addEventListener(() => {
      if (!viewer.isDestroyed()) viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.0008);
    });
  }, [isAutoRotating, viewMode, isCameraLocked]);

  // The drawn orbit path is the next period from "now"; redraw so a satellite never outruns it.
  useEffect(() => {
    const t = window.setInterval(() => setOrbitRefresh((n) => n + 1), Math.max(3000, 45_000 / simSpeed));
    return () => clearInterval(t);
  }, [simSpeed]);

  const visible = useCallback((s: Satellite) => layers.sats && (!focusSat || s.sat_id === focusSat), [layers.sats, focusSat]);

  // Orbit paths: the next period of each satellite's real orbit, in the Earth-fixed frame.
  useEffect(() => {
    const col = orbitLinesRef.current;
    if (!col) return;
    col.removeAll();
    if (!layers.orbits || !layers.sats) return;
    const base = baseMsRef.current + animTimeRef.current * 1000;
    satsRef.current.filter(visible).forEach((sat) => {
      const el = satElements(sat);
      const periodMs = periodMinutes(el.a) * 60_000;
      const pts: Cesium.Cartesian3[] = [];
      for (let k = 0; k <= 96; k++) {
        const e = propagate(el, base + (k / 96) * periodMs).ecef;
        pts.push(new Cesium.Cartesian3(e[0], e[1], e[2]));
      }
      const sel = sat.sat_id === selectedSatId;
      col.add({ positions: pts, width: sel ? 2.5 : 1.2, material: Cesium.Material.fromType('Color', { color: css(colorOf(sat), sel ? 1 : 0.5) }) });
    });
  }, [satKey, healthKey, layers.orbits, layers.sats, visible, selectedSatId, colorOf, orbitRefresh]);

  // Motion loop.
  useEffect(() => {
    const viewer = viewerRef.current;
    const pts = pointsRef.current, lbls = labelsRef.current, drops = dropLinesRef.current;
    const dPts = debrisPointsRef.current, dLbls = debrisLabelsRef.current;
    if (!viewer || viewer.isDestroyed() || !pts || !lbls || !drops || !dPts || !dLbls || satsRef.current.length === 0) return;

    let last = performance.now();
    let frame = 0;
    const objEls = objects.map((o) => o);

    const remove = viewer.clock.onTick.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      const now = performance.now();
      animTimeRef.current += ((now - last) / 1000) * simSpeed;
      last = now;
      const simMs = baseMsRef.current + animTimeRef.current * 1000;
      frame++;

      let sunlit = 0, eclipse = 0;
      let target: Cesium.Cartesian3 | null = null;
      const pos = new Map<string, Cesium.Cartesian3>();

      const satellites = satsRef.current;
      satellites.forEach((sat) => {
        const show = visible(sat);
        const isSel = sat.sat_id === selectedSatId;
        if (!show && !(isSel && isCameraLocked)) {
          const pt0 = satPts.current.get(sat.sat_id); if (pt0) pt0.show = false;
          const l = satLabels.current.get(sat.sat_id); if (l) l.show = false;
          const d = dropLines.current.get(sat.sat_id); if (d) d.show = false;
          return;
        }
        const st = propagate(satElements(sat), simMs);
        const p = new Cesium.Cartesian3(st.ecef[0], st.ecef[1], st.ecef[2]);
        pos.set(sat.sat_id, p);
        if (isSel) target = p;
        if (show) { if (isSunlit(st, simMs)) sunlit++; else eclipse++; }

        const color = css(colorOf(sat));
        const flagged = sat.health_state === 'CRITICAL' ? '#C62828' : sat.health_state === 'WARNING' ? '#E8943A' : '#0C0D10';
        const size = isSel ? 14 : sat.health_state === 'CRITICAL' ? 10 : 7;

        let pt = satPts.current.get(sat.sat_id);
        if (!pt) {
          pt = pts.add({ position: p, pixelSize: size, color, outlineColor: css(flagged), outlineWidth: 2 });
          (pt as unknown as { satId: string }).satId = sat.sat_id;
          satPts.current.set(sat.sat_id, pt);
        }
        pt.position = p; pt.color = color; pt.pixelSize = size; pt.outlineColor = css(isSel ? '#FFFFFF' : flagged); pt.show = show;

        let lb = satLabels.current.get(sat.sat_id);
        if (!lb) {
          lb = lbls.add({ position: p, text: sat.sat_id, font: '11px IBM Plex Mono, monospace', pixelOffset: new Cesium.Cartesian2(0, -16), showBackground: true, backgroundColor: css('#14161B', 0.8) });
          satLabels.current.set(sat.sat_id, lb);
        }
        lb.position = p; lb.fillColor = color; lb.scale = isSel ? 1.15 : 0.9; lb.show = show && (layers.labels || isSel);

        let dl = dropLines.current.get(sat.sat_id);
        if (!dl) {
          dl = drops.add({ positions: [p, p], width: 1, material: Cesium.Material.fromType('Color', { color: css('#94A3B8', 0.35) }) });
          dropLines.current.set(sat.sat_id, dl);
        }
        dl.show = show && layers.dropLines;
        if (dl.show) dl.positions = [Cesium.Cartesian3.fromDegrees(st.lon, st.lat, 0), p];
      });

      // Space objects (positions refreshed at ~12 Hz; they move 7 km/s, a few pixels per update).
      const wantObjects = layers.debris;
      if (frame % 5 === 0 || debPts.current.size === 0) {
        for (const o of objEls) {
          const involved = layers.conjunctions && conjObjectIds.has(o.id);
          const show = wantObjects || involved;
          let pt = debPts.current.get(o.id);
          if (!show && !pt) continue;
          const st = propagate(o.el, simMs);
          const p = new Cesium.Cartesian3(st.ecef[0], st.ecef[1], st.ecef[2]);
          pos.set(`obj:${o.id}`, p);
          if (!pt) {
            pt = dPts.add({ position: p, pixelSize: 3, color: css(OBJECT_COLOR[o.kind]) });
            (pt as unknown as { objectId: string }).objectId = o.id;
            debPts.current.set(o.id, pt);
          }
          pt.position = p;
          pt.show = show;
          pt.pixelSize = involved ? 8 : selectedObject === o.id ? 7 : o.kind === 'DEBRIS' ? 3 : 5;
          pt.color = css(involved ? '#EF4444' : OBJECT_COLOR[o.kind]);

          if (involved || selectedObject === o.id) {
            let lb = debLabels.current.get(o.id);
            if (!lb) { lb = dLbls.add({ position: p, text: o.name, font: '10.5px Inter, sans-serif', fillColor: css('#F3F4F6'), pixelOffset: new Cesium.Cartesian2(0, 14), showBackground: true, backgroundColor: css('#14161B', 0.85) }); debLabels.current.set(o.id, lb); }
            lb.position = p; lb.show = true;
          } else { const lb = debLabels.current.get(o.id); if (lb) lb.show = false; }
        }
      }

      // Lines joining each alerted satellite to its object.
      const wanted = new Set<string>();
      if (layers.conjunctions) {
        for (const c of shownConj.slice(0, 6)) {
          const a = pos.get(c.satId) ?? (() => { const s = satellites.find((x) => x.sat_id === c.satId); if (!s) return undefined; const e = propagate(satElements(s), simMs).ecef; return new Cesium.Cartesian3(e[0], e[1], e[2]); })();
          const b = debPts.current.get(c.objectId)?.position;
          if (!a || !b) continue;
          const key = `${c.satId}|${c.objectId}`;
          wanted.add(key);
          let line = conjLines.current.get(key);
          if (!line) { line = drops.add({ positions: [a, b], width: 2, material: Cesium.Material.fromType('Color', { color: css(RISK_COLOR[c.risk], 0.9) }) }); conjLines.current.set(key, line); }
          line.positions = [a, b]; line.show = true;
        }
      }
      conjLines.current.forEach((l, k) => { if (!wanted.has(k)) l.show = false; });

      // Follow the observed satellite by moving the camera's reference frame with it. The camera's offset
      // inside that frame is left alone, so zoom, tilt and drag-to-rotate keep working while it follows.
      if (viewMode === '3D') {
        const cam = viewer.camera;
        if (isCameraLocked && target) {
          const frame = Cesium.Transforms.eastNorthUpToFixedFrame(target);
          if (!lockApplied.current) {
            cam.lookAtTransform(frame, new Cesium.HeadingPitchRange(0, -1.3, 3_500_000));
            lockApplied.current = true;
          } else cam.lookAtTransform(frame);
        } else if (lockApplied.current) releaseLock(viewer);
      }
      if (frame % 30 === 0) setCounts({ sunlit, eclipse });
    });
    return () => remove();
  }, [satKey, layers, focusSat, selectedSatId, selectedObject, simSpeed, isCameraLocked, viewMode, colorOf, visible, objects, conjObjectIds, shownConj]);

  // ---- controls --------------------------------------------------------------------------------------
  const releaseLock = (viewer: Cesium.Viewer) => {
    const cam = viewer.camera;
    const pos = cam.positionWC.clone(), dir = cam.directionWC.clone(), up = cam.upWC.clone();
    cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
    cam.setView({ destination: pos, orientation: { direction: dir, up } });
    lockApplied.current = false;
  };
  const cam = (fn: (v: Cesium.Viewer) => void) => { const v = viewerRef.current; if (v && !v.isDestroyed()) fn(v); };
  /** 40 % of the current distance: fine steps up close, big ones from orbit. While following, distance is measured to the satellite. */
  const zoomStep = (v: Cesium.Viewer) => (lockApplied.current ? Cesium.Cartesian3.magnitude(v.camera.position) : v.camera.positionCartographic.height) * 0.4;
  const resetCamera = () => cam((v) => {
    setIsCameraLocked(false);
    if (lockApplied.current) releaseLock(v);
    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(20, 20, 16000000), orientation: { heading: 0, pitch: Cesium.Math.toRadians(-85), roll: 0 } });
  });
  const selectSat = (id: string) => { setSelectedSatId(id); setShowInspector(true); setSelectedObject(null); };
  const observe = (id: string | null) => {
    setFocusSat(id);
    if (id) { selectSat(id); setIsCameraLocked(true); } else setIsCameraLocked(false);
  };
  const setAll = (on: boolean) => setLayers({ sats: on, orbits: on, labels: on, dropLines: on, stations: on, coverage: on, places: on, debris: on, conjunctions: on });
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const selectConj = (c: Conjunction) => { setHighlight(c); selectSat(c.satId); setSelectedObject(c.objectId); };

  const objInfo = selectedObject ? objectById.get(selectedObject) : undefined;
  const objState = objInfo ? propagate(objInfo.el, baseMsRef.current + animTimeRef.current * 1000) : undefined;
  const objConj = objInfo ? conjunctions.filter((c) => c.objectId === objInfo.id) : [];
  const btn = (on: boolean) => `p-1.5 rounded ${on ? 'bg-[#0F6E56] text-white' : 'text-[#A1A7B3] hover:bg-[#22262F]'}`;
  const seg = (on: boolean) => `px-2 py-1 rounded text-[11px] ${on ? 'bg-[#22262F] text-[#F3F4F6] font-semibold' : 'text-[#A1A7B3] hover:text-[#F3F4F6]'}`;
  const counts_ = { debris: objects.filter((o) => o.kind === 'DEBRIS').length, rb: objects.filter((o) => o.kind === 'ROCKET_BODY').length, dead: objects.filter((o) => o.kind === 'DEFUNCT').length };

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-[#0C0D10] flex flex-col p-4' : 'w-full h-full min-h-[440px] rounded-lg overflow-hidden border border-[#2B303B] relative bg-[#0C0D10]'}>
      {!isLoaded && <div className="absolute inset-0 z-20 bg-[#0C0D10] flex items-center justify-center font-mono-code text-xs text-[#3CB992]">Loading globe…</div>}

      <div ref={containerRef} className="w-full h-full flex-1" />

      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-[#14161B]/95 border border-[#2B303B] p-1.5 rounded-lg text-xs shadow-lg">
        <select value={selectedSatId} onChange={(e) => selectSat(e.target.value)} aria-label="Satellite"
          className="bg-[#1A1D24] border border-[#2B303B] font-mono-code text-[11px] text-[#F3F4F6] rounded px-2 py-1 cursor-pointer max-w-[120px]">
          <option value="" disabled>Satellite…</option>
          {satellites.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
        </select>
        <button onClick={() => setIsCameraLocked(!isCameraLocked)} className={btn(isCameraLocked)} title="Follow the selected satellite" aria-pressed={isCameraLocked}>
          {isCameraLocked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
        <div className="flex items-center gap-0.5 rounded border border-[#2B303B] p-0.5" role="group" aria-label="Simulation speed">
          {[1, 5, 20].map((s) => <button key={s} onClick={() => setSimSpeed(s)} className={seg(simSpeed === s)}>{s}x</button>)}
        </div>
        <button onClick={() => setLayersOpen(!layersOpen)} className={btn(layersOpen)} title="Layers and display options" aria-pressed={layersOpen}><Layers size={14} /></button>
        <button onClick={() => setIsAutoRotating(!isAutoRotating)} className={btn(isAutoRotating)} title="Auto-rotate"><RotateCw size={14} /></button>
        <button onClick={() => cam((v) => v.camera.zoomIn(zoomStep(v)))} className={btn(false)} title="Zoom in"><ZoomIn size={14} /></button>
        <button onClick={() => cam((v) => v.camera.zoomOut(zoomStep(v)))} className={btn(false)} title="Zoom out"><ZoomOut size={14} /></button>
        <button onClick={resetCamera} className={btn(false)} title="Reset view"><Compass size={14} /></button>
        <button onClick={() => setIsFullscreen(!isFullscreen)} className={btn(false)} title="Fullscreen">{isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
      </div>

      {/* Layers panel */}
      {layersOpen && (
        <div className="absolute top-[58px] right-3 z-20 w-[270px] max-h-[calc(100%-72px)] overflow-y-auto bg-[#14161B] border border-[#2B303B] rounded-xl p-3 text-[12px] text-[#F3F4F6] shadow-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Layers</span>
            <div className="flex gap-1">
              <button onClick={() => setAll(true)} className="px-2 py-0.5 rounded border border-[#2B303B] text-[11px] text-[#A1A7B3] hover:text-[#F3F4F6]">All on</button>
              <button onClick={() => setAll(false)} className="px-2 py-0.5 rounded border border-[#2B303B] text-[11px] text-[#A1A7B3] hover:text-[#F3F4F6]">All off</button>
              <button onClick={() => setLayersOpen(false)} aria-label="Close layers" className="text-[#A1A7B3] hover:text-[#F3F4F6]"><X size={14} /></button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            {(Object.keys(LAYER_LABEL) as (keyof Layers)[]).map((k) => (
              <label key={k} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} className="accent-[#0F6E56]" />
                <span className={layers[k] ? '' : 'text-[#8B92A0]'}>{LAYER_LABEL[k]}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-[#23272F]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5E6572]">Globe style</span>
              <button onClick={() => setStyle(DEFAULT_STYLE)} className="text-[11px] text-[#8B92A0] hover:text-[#F3F4F6]">Reset</button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
                <button key={id} onClick={() => setStyle((x) => ({ ...x, basemap: id }))} title={BASEMAPS[id].hint} aria-pressed={style.basemap === id}
                  className={`px-2 py-1.5 rounded border text-[11px] text-left ${style.basemap === id ? 'border-[#0F6E56] bg-[#0F6E56]/20 text-[#F3F4F6]' : 'border-[#2B303B] text-[#A1A7B3] hover:text-[#F3F4F6]'}`}>
                  {BASEMAPS[id].label}
                </button>
              ))}
            </div>
            <span className="text-[10.5px] text-[#5E6572]">{BASEMAPS[style.basemap].hint}</span>
            {([['lighting', 'Day / night shading'], ['atmosphere', 'Atmosphere glow'], ['grid', 'Latitude / longitude grid']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={style[k]} onChange={() => setStyle((x) => ({ ...x, [k]: !x[k] }))} className="accent-[#0F6E56]" />
                <span>{label}</span>
              </label>
            ))}
            {([['brightness', 'Brightness', 0.4, 1.8], ['saturation', 'Colour', 0, 2]] as const).map(([k, label, min, max]) => (
              <label key={k} className="flex items-center gap-2">
                <span className="w-[68px] text-[#A1A7B3]">{label}</span>
                <input type="range" min={min} max={max} step={0.05} value={style[k]} onChange={(e) => setStyle((x) => ({ ...x, [k]: Number(e.target.value) }))} className="flex-1 accent-[#0F6E56]" />
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#23272F]">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5E6572]">Colour satellites by</span>
            <div className="flex gap-0.5 rounded border border-[#2B303B] p-0.5" role="group">
              {([['health', 'Health'], ['plane', 'Plane'], ['satellite', 'Satellite']] as const).map(([m, l]) => (
                <button key={m} onClick={() => setColorMode(m)} className={`flex-1 ${seg(colorMode === m)}`} aria-pressed={colorMode === m}>{l}</button>
              ))}
            </div>
            {colorMode === 'plane' && <div className="flex flex-wrap gap-2 text-[11px]">{Object.entries(PLANE_COLOR).map(([p, c]) => <span key={p} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{p}</span>)}</div>}
            {colorMode === 'health' && <div className="flex flex-wrap gap-2 text-[11px]">{Object.entries(HEALTH_COLOR).map(([p, c]) => <span key={p} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{p.toLowerCase()}</span>)}</div>}
            {colorMode === 'satellite' && <span className="text-[11px] text-[#8B92A0]">Each satellite has its own colour, shown on its card.</span>}
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#23272F]">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5E6572]">Ground stations</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">{STATIONS.map((s, i) => <span key={s.id} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: STATION_COLOR[i % STATION_COLOR.length] }} />{s.id}</span>)}</div>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5E6572] mt-1">Places</span>
            <div className="flex flex-wrap gap-x-3 text-[11px]">{(['capital', 'city', 'site'] as const).map((k) => <span key={k} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: PLACE_COLOR[k] }} />{k === 'site' ? 'launch / mission site' : k}</span>)}</div>
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#23272F]">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5E6572]">Space objects (demo catalogue)</span>
            <div className="flex flex-col gap-0.5 text-[11px]">
              {([['DEBRIS', counts_.debris], ['ROCKET_BODY', counts_.rb], ['DEFUNCT', counts_.dead]] as const).map(([k, n]) => (
                <span key={k} className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full" style={{ background: OBJECT_COLOR[k] }} />{OBJECT_LABEL[k]} <span className="text-[#8B92A0] ml-auto">{n}</span></span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#23272F]">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5E6572]">Observe one satellite</span>
            {focusSat ? (
              <button onClick={() => observe(null)} className="flex items-center justify-center gap-1.5 h-8 rounded bg-[#0F6E56] text-white text-[12px] font-medium"><Eye size={14} /> Observing {focusSat} · show all</button>
            ) : (
              <div className="flex gap-1.5">
                <select value={selectedSatId} onChange={(e) => selectSat(e.target.value)} aria-label="Satellite to observe" className="flex-1 bg-[#1A1D24] border border-[#2B303B] font-mono-code text-[11px] rounded px-2 h-8">
                  <option value="" disabled>Pick a satellite…</option>
                  {satellites.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
                </select>
                <button onClick={() => selectedSatId && observe(selectedSatId)} disabled={!selectedSatId} className="px-2.5 h-8 rounded border border-[#0F6E56] text-[#3CB992] text-[12px] disabled:opacity-40 flex items-center gap-1"><EyeOff size={13} /> Observe</button>
              </div>
            )}
            <span className="text-[11px] text-[#8B92A0]">Hides every other satellite and follows this one with the camera.</span>
          </div>
        </div>
      )}

      {/* Status strip */}
      <div className="absolute bottom-3 left-3 z-10 bg-[#14161B]/90 border border-[#2B303B] px-3 py-1.5 rounded-md text-[11px] text-[#A1A7B3] pointer-events-none flex items-center gap-4">
        {focusSat ? <span className="text-[#3CB992] font-semibold">Observing {focusSat}</span> : <span>{layers.sats ? satellites.length : 0} satellites</span>}
        <span>{counts.sunlit} sunlit</span>
        <span>{counts.eclipse} in eclipse</span>
        {layers.debris && <span>{objects.length} objects</span>}
      </div>

      {/* Conjunction alerts */}
      {layers.conjunctions && shownConj.length > 0 && (
        <div className="absolute bottom-3 right-3 z-20 w-[330px] max-h-[45%] overflow-y-auto bg-[#14161B] border border-[#2B303B] rounded-xl p-2.5 text-[11.5px] shadow-2xl">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="font-semibold text-[#F3F4F6]">Conjunctions · next 4 h</span>
            <span className="text-[#8B92A0]">{shownConj.length} under 25 km</span>
          </div>
          {shownConj.slice(0, 8).map((c) => (
            <button key={`${c.satId}${c.objectId}`} onClick={() => selectConj(c)}
              className={`w-full text-left rounded-md px-2 py-1.5 flex items-start gap-2 hover:bg-[#1A1D24] ${highlight === c ? 'bg-[#1A1D24]' : ''}`}>
              <i className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: RISK_COLOR[c.risk] }} />
              <span className="flex-1 min-w-0">
                <span className="block font-mono-code text-[#F3F4F6] truncate">{c.satId} × {c.objectName}</span>
                <span className="block text-[#8B92A0]">in {fmtIn(c.tcaMs - Date.now())} · <b className="text-[#F3F4F6]">{c.missKm.toFixed(1)} km</b> · {c.relSpeedKms.toFixed(1)} km/s</span>
              </span>
              <span className="text-[10px] font-bold" style={{ color: RISK_COLOR[c.risk] }}>{c.risk}</span>
            </button>
          ))}
          <p className="px-1 pt-1.5 text-[10.5px] text-[#5E6572]">Screening is real geometry against a demo catalogue, not live tracking data.</p>
        </div>
      )}

      {/* Selected space object */}
      {objInfo && objState && (
        <div className="absolute bottom-14 left-3 z-20 w-[260px] bg-[#14161B] border border-[#2B303B] rounded-xl p-3 text-[11.5px] font-mono-code shadow-2xl flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-bold flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: OBJECT_COLOR[objInfo.kind] }} />{objInfo.name}</span>
            <button onClick={() => setSelectedObject(null)} aria-label="Close" className="text-[#A1A7B3] hover:text-[#F3F4F6]"><X size={14} /></button>
          </div>
          <span className="text-[#8B92A0]">{OBJECT_LABEL[objInfo.kind]} · {objInfo.group}</span>
          <div className="flex justify-between"><span className="text-[#8B92A0]">Altitude</span><b>{objState.altKm.toFixed(0)} km</b></div>
          <div className="flex justify-between"><span className="text-[#8B92A0]">Speed</span><b>{objState.speedKms.toFixed(2)} km/s</b></div>
          <div className="flex justify-between"><span className="text-[#8B92A0]">Inclination</span><b>{(objInfo.el.inc * 180 / Math.PI).toFixed(1)}°</b></div>
          <div className="flex justify-between"><span className="text-[#8B92A0]">Position</span><b>{Math.abs(objState.lat).toFixed(1)}° {objState.lat >= 0 ? 'N' : 'S'}, {Math.abs(objState.lon).toFixed(1)}° {objState.lon >= 0 ? 'E' : 'W'}</b></div>
          {objConj.length > 0 && <span className="text-[#F59E0B] pt-1">Approaches {objConj[0].satId} to {objConj[0].missKm.toFixed(1)} km in {fmtIn(objConj[0].tcaMs - Date.now())}</span>}
        </div>
      )}

      {showInspector && activeSat && selectedSatId && (
        <SatelliteDetailCard
          sat={activeSat as Satellite & { tenant?: string }}
          getMs={() => baseMsRef.current + animTimeRef.current * 1000}
          locked={isCameraLocked}
          onToggleLock={() => setIsCameraLocked(!isCameraLocked)}
          observing={focusSat === activeSat.sat_id}
          onToggleObserve={() => observe(focusSat === activeSat.sat_id ? null : activeSat.sat_id)}
          color={colorOf(activeSat)}
          onClose={() => setShowInspector(false)}
          onOpen={() => onNavigateRef.current?.(activeSat.sat_id)}
        />
      )}
    </div>
  );
};
