import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Compass, Eye, EyeOff, Layers, Lock, Maximize2, Minimize2, RotateCw, Unlock, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Satellite } from '../../types';
import { STATIONS } from '../../data/fleet';
import { isSunlit, periodMinutes, propagate } from '../../orbit/orbit';
import { satElements } from '../../orbit/fleetOrbit';
import { PLACES } from '../../orbit/places';
import { Conjunction, ObjectKind } from '../../orbit/debris';
import { useConjunctionStore } from '../../ops/conjunctionStore';
import { SatelliteDetailCard } from './SatelliteDetailCard';
import { Select } from '../molecules/Select';

interface CesiumGlobeProps {
  satellites: Satellite[];
  onSelectSat?: (satId: string) => void;
  viewMode?: '3D' | '2D';
  /** Open alarms of any kind as comma-joined "SAT:crit" / "SAT:warn": labelled, and the orbit track takes that colour. */
  alarmed?: string;
  /** Satellite state as comma-joined "SAT:crit" / "SAT:warn" (health flags and health alarms): the dot's colour. */
  flags?: string;
  /** In contact now as comma-joined "SAT@STATION": labelled, haloed, and the station footprint shows. */
  contacts?: string;
  /** Comma-joined ids with no telemetry yet: drawn as hollow rings. */
  nodata?: string;
}

// ---- palettes ------------------------------------------------------------------------------------

type ColorMode = 'health' | 'plane' | 'satellite';
// Console palette (see the legend chips): quiet plane colours for orbits, state colours for satellites.
const PLANE_COLOR: Record<string, string> = { 'Plane A': '#6CB8FF', 'Plane B': '#9B8CFF', 'Plane C': '#3DD9C1', 'Plane D': '#D8C38A' };
const OTHER_PLANE = '#7C8594';
export const HEALTH_COLOR: Record<string, string> = { NOMINAL: '#C9D6E8', WARNING: '#F5C451', CRITICAL: '#FF6B6B' };
const NODATA = '#6B7383', CONTACT = '#6CB8FF', STATION = '#F28C28', SELECTED = '#F28C28';
const PLACE_COLOR = { capital: '#F5C451', city: '#FDE68A', site: '#FB923C' } as const;
const OBJECT_COLOR: Record<ObjectKind, string> = { DEBRIS: '#7C8594', ROCKET_BODY: '#7C8594', DEFUNCT: '#7C8594' };
const OBJECT_LABEL: Record<ObjectKind, string> = { DEBRIS: 'Debris fragment', ROCKET_BODY: 'Rocket body', DEFUNCT: 'Defunct satellite' };
const RISK_COLOR = { CRITICAL: '#FF6B6B', WARNING: '#F5C451', WATCH: '#9AA3B2' } as const;

/** Small canvas sprites: Cesium points are circles only. */
const sprite = (size: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); if (g) draw(g);
  return c;
};
const CROSS = () => sprite(9, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(1, 1); g.lineTo(8, 8); g.moveTo(8, 1); g.lineTo(1, 8); g.stroke(); });
const ROUND_SQUARE = () => sprite(9, (g) => { g.fillStyle = STATION; g.strokeStyle = '#090B10'; g.lineWidth = 1; g.beginPath(); g.roundRect(1, 1, 7, 7, 2); g.fill(); g.stroke(); });
const LABEL_BG = 'rgba(17,20,27,0.9)', LABEL_TEXT = '#C9CED6';

/** Golden-angle hue steps keep neighbours in the list visually apart, whatever the fleet size. */
const hsl = (h: number, s: number, l: number) => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};

export function satColor(sat: Satellite, index: number, mode: ColorMode): string {
  if (mode === 'plane') return PLANE_COLOR[sat.constellation_group] ?? OTHER_PLANE;
  if (mode === 'satellite') return hsl((index * 137.508) % 360, 0.72, 0.62);
  return HEALTH_COLOR[sat.health_state] ?? HEALTH_COLOR.NOMINAL;
}

// ---- globe styles --------------------------------------------------------------------------------
// Every basemap here is free to use without a token. "natural" ships inside Cesium and works offline.

type BasemapId = 'satellite' | 'natural' | 'dark' | 'light' | 'topo' | 'streets' | 'night';
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services';
const BASEMAPS: Record<BasemapId, { label: string; url?: string; max: number; hint: string }> = {
  satellite: { label: 'Satellite', url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, max: 18, hint: 'Esri World Imagery' },
  natural: { label: 'Natural Earth', max: 5, hint: 'Bundled · works offline' },
  dark: { label: 'Dark canvas', url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, max: 16, hint: 'Muted dark map, lets satellites stand out' },
  light: { label: 'Light canvas', url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, max: 16, hint: 'Muted light map' },
  topo: { label: 'Topographic', url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, max: 18, hint: 'Terrain, roads and borders' },
  streets: { label: 'Streets', url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, max: 18, hint: 'Street map' },
  night: { label: 'Night lights', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLightsAtNight2012/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg', max: 8, hint: 'NASA Earth at night' },
};

interface GlobeStyle { basemap: BasemapId; lighting: boolean; atmosphere: boolean; grid: boolean; brightness: number; saturation: number }
/** Dark matte by default: the offline Natural Earth imagery, dimmed and desaturated so satellites carry the colour. */
const DEFAULT_STYLE: GlobeStyle = { basemap: 'natural', lighting: true, atmosphere: false, grid: false, brightness: 0.45, saturation: 0.25 };

const css = (hex: string, alpha = 1) => Cesium.Color.fromCssColorString(hex).withAlpha(alpha);

// ---- layers --------------------------------------------------------------------------------------

type OrbitScope = 'all' | 'selected' | 'off';
interface Layers { sats: boolean; orbits: OrbitScope; labels: boolean; dropLines: boolean; stations: boolean; coverage: boolean; places: boolean; debris: boolean; conjunctions: boolean }
// Decluttered default: state-coloured dots, quiet orbits for all, labels and ground track only where they matter.
const DEFAULT_LAYERS: Layers = { sats: true, orbits: 'all', labels: false, dropLines: false, stations: true, coverage: true, places: false, debris: false, conjunctions: true };
type LayerFlag = Exclude<keyof Layers, 'orbits'>;
const LAYER_LABEL: Record<LayerFlag, string> = {
  sats: 'Satellites', labels: 'Labels on every satellite', dropLines: 'Drop lines to ground', stations: 'Ground stations',
  coverage: 'Station coverage', places: 'Place references', debris: 'Space debris & objects', conjunctions: 'Conjunction alerts',
};
const STORE_KEY = 'vyuh-globe-layers-v5';
const loadLayers = (): { layers: Layers; mode: ColorMode; style: GlobeStyle } => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (v) return { layers: { ...DEFAULT_LAYERS, ...v.layers }, mode: v.mode ?? 'health', style: { ...DEFAULT_STYLE, ...v.style } };
  } catch { /* storage blocked or corrupt */ }
  return { layers: DEFAULT_LAYERS, mode: 'health', style: DEFAULT_STYLE };
};

/** Straight down over India, far enough that the Earth fills about 80 % of the view's height. */
function homeView(viewer: Cesium.Viewer) {
  const c = viewer.scene.canvas;
  const aspect = c.clientWidth && c.clientHeight ? c.clientWidth / c.clientHeight : 1.6;
  const fov = (viewer.camera.frustum as Cesium.PerspectiveFrustum).fov ?? Math.PI / 3;
  const vfov = aspect > 1 ? 2 * Math.atan(Math.tan(fov / 2) / aspect) : fov;
  const R = 6_378_137;
  const alt = R / Math.sin((0.8 * vfov) / 2) - R;
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(78, 15, alt), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } });
}

const fmtIn = (ms: number) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };

export const CesiumGlobe: React.FC<CesiumGlobeProps> = ({ satellites, onSelectSat, viewMode = '3D', alarmed = '', flags = '', contacts = '', nodata = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const pointsRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const labelsRef = useRef<Cesium.LabelCollection | null>(null);
  const orbitLinesRef = useRef<Cesium.PolylineCollection | null>(null);
  const dropLinesRef = useRef<Cesium.PolylineCollection | null>(null);
  const debrisPointsRef = useRef<Cesium.BillboardCollection | null>(null);
  const debrisLabelsRef = useRef<Cesium.LabelCollection | null>(null);

  const satPts = useRef(new Map<string, Cesium.PointPrimitive>());
  const satLabels = useRef(new Map<string, Cesium.Label>());
  const dropLines = useRef(new Map<string, Cesium.Polyline>());
  const debPts = useRef(new Map<string, Cesium.Billboard>());
  const debLabels = useRef(new Map<string, Cesium.Label>());
  const conjLines = useRef(new Map<string, Cesium.Polyline>());
  const stationEnts = useRef<{ id: string; point: Cesium.Entity; ring: Cesium.Entity }[]>([]);
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
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [orbitRefresh, setOrbitRefresh] = useState(0);
  const [counts, setCounts] = useState({ sunlit: 0, eclipse: 0 });

  // Sim clock readout: the globe can run ahead of real time, and must say so.
  const [, setClockTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setClockTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const simMsNow = baseMsRef.current + animTimeRef.current * 1000;
  const simOffsetMs = simMsNow - Date.now();
  const offTime = Math.abs(simOffsetMs) > 2000;
  const backToNow = () => { baseMsRef.current = Date.now(); animTimeRef.current = 0; setSimSpeed(1); setOrbitRefresh((n) => n + 1); };
  const fmtOffset = (ms: number) => { const m = Math.round(Math.abs(ms) / 60000); return `${ms >= 0 ? '+' : '−'}${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m ? `${m} min` : `${Math.round(Math.abs(ms) / 1000)} s`}`; };
  // Follow and auto-rotate do nothing on the flat map, and auto-rotate does nothing while following.
  const is3D = viewMode === '3D';
  useEffect(() => { if (!is3D) { setIsCameraLocked(false); setIsAutoRotating(false); } }, [is3D]);

  const onNavigateRef = useRef(onSelectSat);
  onNavigateRef.current = onSelectSat;

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ layers, mode: colorMode, style })); } catch { /* ignore */ }
  }, [layers, colorMode, style]);

  // The parent hands over a fresh array every tick; everything expensive keys off the ids instead.
  const alarmOf = useMemo(() => new Map(alarmed.split(',').filter(Boolean).map((x) => x.split(':') as [string, string])), [alarmed]);
  const flagOf = useMemo(() => new Map(flags.split(',').filter(Boolean).map((x) => x.split(':') as [string, string])), [flags]);
  const contactPairs = useMemo(() => contacts.split(',').filter(Boolean).map((x) => x.split('@')), [contacts]);
  const contactSats = useMemo(() => new Set(contactPairs.map(([s]) => s)), [contactPairs]);
  const contactStations = useMemo(() => new Set(contactPairs.map(([, g]) => g)), [contactPairs]);
  const nodataSet = useMemo(() => new Set(nodata.split(',').filter(Boolean)), [nodata]);
  const labelledSet = useMemo(() => new Set([...alarmOf.keys(), ...contactSats]), [alarmOf, contactSats]);
  const satsRef = useRef(satellites);
  satsRef.current = satellites;
  const satKey = satellites.map((s) => s.sat_id).join(',');
  const healthKey = satellites.map((s) => s.health_state[0]).join('');
  const indexOf = useMemo(() => new Map(satsRef.current.map((s, i) => [s.sat_id, i])), [satKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorOf = useCallback((s: Satellite) => {
    const a = colorMode === 'health' ? flagOf.get(s.sat_id) : undefined; // a health alarm outranks a nominal health flag
    return a ? HEALTH_COLOR[a === 'crit' ? 'CRITICAL' : 'WARNING'] : satColor(s, indexOf.get(s.sat_id) ?? 0, colorMode);
  }, [indexOf, colorMode, flagOf]);
  const activeSat = satellites.find((s) => s.sat_id === selectedSatId) || satellites[0];

  // ---- space objects and conjunction screening (shared, see ops/conjunctionStore) ----------------------
  const objects = useConjunctionStore((s) => s.objects);
  const conjunctions = useConjunctionStore((s) => s.conjunctions);
  const objectById = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);

  // Drawn and listed: events in the next 4 h above the alarm threshold (warning or critical), max 6 lines drawn.
  const shownConj = useMemo(() => conjunctions.filter((c) => (!focusSat || c.satId === focusSat) && c.risk !== 'WATCH' && c.tcaMs - Date.now() < 4 * 3_600_000), [conjunctions, focusSat]);
  const [conjOpen, setConjOpen] = useState(false);
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
    // No engine branding on the console; imagery attribution is drawn by us below when the tile source needs it.
    (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none';
    scene.backgroundColor = css('#0D1016');
    if (scene.skyBox) scene.skyBox.show = false;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    if (scene.globe) {
      scene.globe.show = true;
      scene.globe.baseColor = css('#131925');
    }

    pointsRef.current = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    labelsRef.current = scene.primitives.add(new Cesium.LabelCollection());
    orbitLinesRef.current = scene.primitives.add(new Cesium.PolylineCollection());
    dropLinesRef.current = scene.primitives.add(new Cesium.PolylineCollection());
    debrisPointsRef.current = scene.primitives.add(new Cesium.BillboardCollection());
    debrisLabelsRef.current = scene.primitives.add(new Cesium.LabelCollection());

    // Ground stations: kesari rounded squares with small labels. Two stations close together (HYD / BLR)
    // would stack their labels, so the southern one's label goes below its marker. The contact footprint
    // (about 10° elevation mask at 525 km) shows only while a satellite is in contact through it.
    const square = ROUND_SQUARE();
    stationEnts.current = STATIONS.map((st) => {
      const pos = Cesium.Cartesian3.fromDegrees(st.lon, st.lat, 0);
      const northNeighbour = STATIONS.some((o) => o !== st && Math.hypot(o.lat - st.lat, o.lon - st.lon) < 12 && o.lat > st.lat);
      const point = viewer.entities.add({
        position: pos,
        billboard: { image: square, width: 7, height: 7 },
        label: {
          text: st.id, font: '10px Geist, sans-serif', fillColor: css(LABEL_TEXT), pixelOffset: new Cesium.Cartesian2(0, northNeighbour ? 13 : -13),
          showBackground: true, backgroundColor: Cesium.Color.fromCssColorString(LABEL_BG), backgroundPadding: new Cesium.Cartesian2(5, 2),
        },
      });
      const ring = viewer.entities.add({
        position: pos,
        ellipse: { semiMajorAxis: 1_800_000, semiMinorAxis: 1_800_000, material: css(CONTACT, 0.05), outline: true, outlineColor: css(CONTACT, 0.35), outlineWidth: 1 },
      });
      return { id: st.id, point, ring };
    });

    // Place references.
    placeEnts.current = PLACES.map((pl) => viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pl.lon, pl.lat, 0),
      point: { pixelSize: pl.kind === 'site' ? 7 : 5, color: css(PLACE_COLOR[pl.kind]), outlineColor: css('#090B10'), outlineWidth: 1 },
      label: {
        text: pl.name, font: '10.5px Geist, sans-serif', fillColor: css(PLACE_COLOR[pl.kind]), pixelOffset: new Cesium.Cartesian2(0, 12),
        showBackground: true, backgroundColor: css('#090B10', 0.6), scale: 0.95,
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

    homeView(viewer);

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
    stationEnts.current.forEach((s) => { s.point.show = layers.stations; s.ring.show = layers.stations && layers.coverage && contactStations.has(s.id); });
    placeEnts.current.forEach((p) => { p.show = layers.places; });
  }, [layers.stations, layers.coverage, layers.places, contactStations, isLoaded]);

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

  // A faint blue wash over the imagery so land and ocean read as quiet blue-greys.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isLoaded) return;
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const g = c.getContext('2d'); if (g) { g.fillStyle = '#1E3A66'; g.fillRect(0, 0, 1, 1); }
    const layer = viewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({ url: c.toDataURL(), tileWidth: 1, tileHeight: 1 }));
    layer.alpha = 0.12;
    return () => { if (!viewer.isDestroyed()) viewer.imageryLayers.remove(layer, true); };
  }, [isLoaded]);

  // Tweaks that do not need a new layer.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !isLoaded) return;
    const g = viewer.scene.globe;
    g.enableLighting = style.lighting;
    // Subtle terminator: day side saturates to full brightness, night side stays at 85 %.
    g.vertexShadowDarkness = 0.85;
    g.lambertDiffuseMultiplier = 8;
    g.lightingFadeOutDistance = 6.5e7;
    g.lightingFadeInDistance = 9e7;
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
    if (layers.orbits === 'off' || !layers.sats) return;
    const base = baseMsRef.current + animTimeRef.current * 1000;
    satsRef.current.filter(visible).filter((s) => layers.orbits === 'all' || s.sat_id === selectedSatId).forEach((sat) => {
      const el = satElements(sat);
      const periodMs = periodMinutes(el.a) * 60_000;
      const pts: Cesium.Cartesian3[] = [];
      for (let k = 0; k <= 96; k++) {
        const e = propagate(el, base + (k / 96) * periodMs).ecef;
        pts.push(new Cesium.Cartesian3(e[0], e[1], e[2]));
      }
      const sel = sat.sat_id === selectedSatId;
      const alarm = alarmOf.get(sat.sat_id);
      // Quiet by default (plane colour, thin, faint); an open alarm tints it; the selected one is bright.
      const color = sel ? css(PLANE_COLOR[sat.constellation_group] ?? OTHER_PLANE) : alarm ? css(HEALTH_COLOR[alarm === 'crit' ? 'CRITICAL' : 'WARNING'], 0.6) : css(PLANE_COLOR[sat.constellation_group] ?? OTHER_PLANE, 0.35);
      col.add({ positions: pts, width: sel ? 2 : alarm ? 1.4 : 1.1, material: Cesium.Material.fromType('Color', { color }) });
      if (sel) {
        // Ground track under the selected satellite, sampled finely so the chords stay above the surface.
        const ground: Cesium.Cartesian3[] = [];
        for (let k = 0; k <= 360; k++) { const g = propagate(el, base + (k / 360) * periodMs); ground.push(Cesium.Cartesian3.fromDegrees(g.lon, g.lat, 10_000)); }
        col.add({ positions: ground, width: 1.5, material: Cesium.Material.fromType('PolylineDash', { color: css(PLANE_COLOR[sat.constellation_group] ?? OTHER_PLANE, 0.7), dashLength: 10 }) });
      }
    });
  }, [satKey, healthKey, alarmOf, layers.orbits, layers.sats, visible, selectedSatId, colorOf, orbitRefresh]);

  // Motion loop.
  useEffect(() => {
    const viewer = viewerRef.current;
    const pts = pointsRef.current, lbls = labelsRef.current, drops = dropLinesRef.current;
    const dPts = debrisPointsRef.current, dLbls = debrisLabelsRef.current;
    if (!viewer || viewer.isDestroyed() || !pts || !lbls || !drops || !dPts || !dLbls || satsRef.current.length === 0) return;

    let last = performance.now();
    let frame = 0;
    const objEls = objects.map((o) => o);
    const cross = CROSS();

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

        // 6 px dot with a 1 px dark rim; contact = blue halo; no data = hollow grey ring; selected = 9 px, kesari ring.
        const hollow = colorMode === 'health' && nodataSet.has(sat.sat_id) && !flagOf.has(sat.sat_id);
        const color = hollow ? Cesium.Color.TRANSPARENT : css(colorOf(sat));
        const ring = isSel ? SELECTED : contactSats.has(sat.sat_id) ? CONTACT : hollow ? NODATA : '#090B10';
        const ringW = isSel || contactSats.has(sat.sat_id) || hollow ? 2 : 1;
        const size = isSel ? 9 : 6;

        let pt = satPts.current.get(sat.sat_id);
        if (!pt) {
          pt = pts.add({ position: p, pixelSize: size, color, outlineColor: css(ring), outlineWidth: ringW });
          (pt as unknown as { satId: string }).satId = sat.sat_id;
          satPts.current.set(sat.sat_id, pt);
        }
        pt.position = p; pt.color = color; pt.pixelSize = size; pt.outlineColor = css(ring); pt.outlineWidth = ringW; pt.show = show;

        let lb = satLabels.current.get(sat.sat_id);
        if (!lb) {
          lb = lbls.add({ position: p, text: sat.sat_id, font: '11px Geist Mono, monospace', pixelOffset: new Cesium.Cartesian2(0, -15), showBackground: true, backgroundColor: Cesium.Color.fromCssColorString(LABEL_BG), backgroundPadding: new Cesium.Cartesian2(6, 3) });
          satLabels.current.set(sat.sat_id, lb);
        }
        lb.position = p; lb.fillColor = css(isSel ? '#FFFFFF' : LABEL_TEXT); lb.scale = 1; lb.show = show && (layers.labels || isSel || labelledSet.has(sat.sat_id));

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
            pt = dPts.add({ position: p, image: cross, width: 7, height: 7, color: css(OBJECT_COLOR[o.kind]) });
            (pt as unknown as { objectId: string }).objectId = o.id;
            debPts.current.set(o.id, pt);
          }
          pt.position = p;
          pt.show = show;
          pt.width = pt.height = involved ? 11 : selectedObject === o.id ? 10 : o.kind === 'DEBRIS' ? 6 : 8;
          pt.color = css(involved ? RISK_COLOR.CRITICAL : OBJECT_COLOR[o.kind]);

          if (involved || selectedObject === o.id) {
            let lb = debLabels.current.get(o.id);
            if (!lb) { lb = dLbls.add({ position: p, text: o.name, font: '11px Geist, sans-serif', fillColor: css(LABEL_TEXT), pixelOffset: new Cesium.Cartesian2(0, 14), showBackground: true, backgroundColor: Cesium.Color.fromCssColorString(LABEL_BG), backgroundPadding: new Cesium.Cartesian2(6, 3) }); debLabels.current.set(o.id, lb); }
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
          if (!line) { line = drops.add({ positions: [a, b], width: 2, material: Cesium.Material.fromType('PolylineDash', { color: css(RISK_COLOR[c.risk], 0.9), dashLength: 12 }) }); conjLines.current.set(key, line); }
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
  }, [satKey, layers, labelledSet, contactSats, nodataSet, flagOf, colorMode, focusSat, selectedSatId, selectedObject, simSpeed, isCameraLocked, viewMode, colorOf, visible, objects, conjObjectIds, shownConj]);

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
    homeView(v);
  });
  const selectSat = (id: string) => { setSelectedSatId(id); setShowInspector(true); setSelectedObject(null); };
  const observe = (id: string | null) => {
    setFocusSat(id);
    if (id) { selectSat(id); setIsCameraLocked(true); } else setIsCameraLocked(false);
  };
  const setAll = (on: boolean) => setLayers({ sats: on, orbits: on ? 'all' : 'off', labels: on, dropLines: on, stations: on, coverage: on, places: on, debris: on, conjunctions: on });
  const toggle = (k: LayerFlag) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const selectConj = (c: Conjunction) => { setHighlight(c); selectSat(c.satId); setSelectedObject(c.objectId); };

  const objInfo = selectedObject ? objectById.get(selectedObject) : undefined;
  const objState = objInfo ? propagate(objInfo.el, baseMsRef.current + animTimeRef.current * 1000) : undefined;
  const objConj = objInfo ? conjunctions.filter((c) => c.objectId === objInfo.id) : [];
  const btn = (on: boolean) => `p-1.5 rounded ${on ? 'bg-[#2F3A4F] text-white' : 'text-[#9AA3B2] hover:bg-[#1A1E27]'}`;
  const seg = (on: boolean) => `px-2 py-1 rounded text-[11px] ${on ? 'bg-[#1A1E27] text-[#E9ECF1] font-semibold' : 'text-[#9AA3B2] hover:text-[#E9ECF1]'}`;
  const counts_ = { debris: objects.filter((o) => o.kind === 'DEBRIS').length, rb: objects.filter((o) => o.kind === 'ROCKET_BODY').length, dead: objects.filter((o) => o.kind === 'DEFUNCT').length };

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-[#090B10] flex flex-col p-4' : 'w-full h-full min-h-[440px] overflow-hidden relative bg-[#0D1016]'}>
      {!isLoaded && <div className="absolute inset-0 z-20 bg-[#090B10] flex items-center justify-center font-mono-code text-xs text-[#6CB8FF]">Loading 3D view…</div>}

      <div ref={containerRef} className="w-full h-full flex-1" />
      {BASEMAPS[style.basemap].url && (
        <span className="absolute bottom-1.5 right-2 z-10 text-[10px] text-[#7C8594] pointer-events-none">Imagery © {BASEMAPS[style.basemap].url!.includes('arcgisonline') ? 'Esri' : 'NASA GIBS'}</span>
      )}

      {/* Floating controls */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-end gap-2 text-[13px] pointer-events-none [&>*]:pointer-events-auto">
        <label className="h-9 flex items-center gap-2 rounded-[10px] bg-[#11141B]/95 px-3">
          <span className="text-[#7C8594]">Satellite</span>
          <Select value={selectedSatId} onChange={(e) => selectSat(e.target.value)} aria-label="Select satellite"
            className="bg-transparent font-mono-code text-[13px] text-[#E9ECF1] outline-none max-w-[110px]">
            <option value="" disabled>Pick…</option>
            {satellites.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
          </Select>
        </label>
        {is3D && (
          <button type="button" onClick={() => setIsCameraLocked(!isCameraLocked)} disabled={!selectedSatId} aria-pressed={isCameraLocked}
            title={selectedSatId ? 'Follow the selected satellite with the camera' : 'Pick a satellite to follow'}
            className={`h-9 px-3 rounded-[10px] flex items-center gap-1.5 disabled:opacity-40 ${isCameraLocked ? 'bg-[#232936] text-white' : 'bg-[#11141B]/95 text-[#C9CED6] hover:text-white'}`}>
            {isCameraLocked ? <Lock size={14} /> : <Unlock size={14} />} Follow
          </button>
        )}
        <span className="flex-1" />
        <div role="group" aria-label="Simulation speed" className="flex p-[3px] rounded-xl bg-[#11141B]/95 font-mono-code text-[12.5px]">
          {[1, 20, 60].map((v) => <button key={v} type="button" aria-pressed={simSpeed === v} onClick={() => setSimSpeed(v)} className={`h-[30px] px-2.5 rounded-[9px] ${simSpeed === v ? 'bg-[#232936] text-white' : 'text-[#9AA3B2] hover:text-white'}`}>{v}×</button>)}
        </div>
        {offTime || simSpeed !== 1 ? (
          <span className="h-9 flex items-center gap-1.5 rounded-[10px] bg-[#F5C451]/[0.14] px-3 text-[#F5C451]" role="status">
            Sim time <span className="font-mono-code">{new Date(simMsNow).toISOString().slice(11, 19)} · {fmtOffset(simOffsetMs)}</span>
          </span>
        ) : (
          <span className="h-9 flex items-center gap-1.5 rounded-[10px] bg-[#11141B]/95 px-3 text-[#C9CED6]">Real time <span className="font-mono-code text-[#7C8594]">{new Date(simMsNow).toISOString().slice(11, 19)}</span></span>
        )}
        {(offTime || simSpeed !== 1) && <button type="button" onClick={backToNow} className="h-9 px-3 rounded-[10px] bg-[#171B24] border border-[#232936] text-[#E9ECF1] hover:bg-[#1D222D]">Back to now</button>}
        {is3D && !isCameraLocked && (
          <button type="button" onClick={() => setIsAutoRotating(!isAutoRotating)} aria-pressed={isAutoRotating} title="Slowly rotate the 3D view"
            className={`h-9 w-9 rounded-[10px] flex items-center justify-center ${isAutoRotating ? 'bg-[#232936] text-white' : 'bg-[#11141B]/95 text-[#C9CED6] hover:text-white'}`}><RotateCw size={15} /><span className="sr-only">Auto-rotate</span></button>
        )}
        <button type="button" onClick={() => setLayersOpen(!layersOpen)} aria-pressed={layersOpen} aria-expanded={layersOpen}
          className={`h-9 px-3 rounded-[10px] flex items-center gap-2 ${layersOpen ? 'bg-[#232936] text-white' : 'bg-[#171B24] border border-[#232936] text-[#E9ECF1]'}`}>
          <Layers size={15} /> Layers · {Object.values(layers).filter((v) => v && v !== 'off').length}
        </button>
      </div>

      <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-0.5 p-[3px] rounded-xl bg-[#11141B]/95 border border-[#232936]">
        <button type="button" onClick={() => cam((v) => v.camera.zoomIn(zoomStep(v)))} aria-label="Zoom in" className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center text-[#C9CED6] hover:bg-[#1A1E27]"><ZoomIn size={16} /></button>
        <button type="button" onClick={() => cam((v) => v.camera.zoomOut(zoomStep(v)))} aria-label="Zoom out" className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center text-[#C9CED6] hover:bg-[#1A1E27]"><ZoomOut size={16} /></button>
        <button type="button" onClick={resetCamera} aria-label="Reset view" className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center text-[#C9CED6] hover:bg-[#1A1E27]"><Compass size={16} /></button>
        <button type="button" onClick={() => setIsFullscreen(!isFullscreen)} aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'} className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center text-[#C9CED6] hover:bg-[#1A1E27]">{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
      </div>

      {/* Layers panel */}
      {layersOpen && (
        <div className="absolute top-[58px] right-3 z-30 w-[280px] max-h-[calc(100%-72px)] overflow-y-auto bg-[#11141B] border border-[#232936] rounded-xl p-3 text-[12px] text-[#E9ECF1] shadow-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Layers</span>
            <div className="flex gap-1">
              <button onClick={() => setAll(true)} className="px-2 py-0.5 rounded border border-[#232936] text-[11px] text-[#9AA3B2] hover:text-[#E9ECF1]">All on</button>
              <button onClick={() => setAll(false)} className="px-2 py-0.5 rounded border border-[#232936] text-[11px] text-[#9AA3B2] hover:text-[#E9ECF1]">All off</button>
              <button onClick={() => { setLayers(DEFAULT_LAYERS); setColorMode('health'); }} className="px-2 py-0.5 rounded border border-[#232936] text-[11px] text-[#9AA3B2] hover:text-[#E9ECF1]">Defaults</button>
              <button onClick={() => setLayersOpen(false)} aria-label="Close layers" className="text-[#9AA3B2] hover:text-[#E9ECF1]"><X size={14} /></button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 py-0.5">
              <span>Orbits</span>
              <div className="flex gap-0.5 rounded border border-[#232936] p-0.5" role="group" aria-label="Orbits">
                {([['all', 'All'], ['selected', 'Selected only'], ['off', 'Off']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setLayers((x) => ({ ...x, orbits: v }))} className={seg(layers.orbits === v)} aria-pressed={layers.orbits === v}>{l}</button>
                ))}
              </div>
            </div>
            {(Object.keys(LAYER_LABEL) as LayerFlag[]).map((k) => (
              <label key={k} className="flex items-center gap-2 py-0.5 cursor-pointer">
                <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)}  />
                <span className={layers[k] ? '' : 'text-[#7C8594]'}>{LAYER_LABEL[k]}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-[#1A1E27]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#7C8594]">Globe style</span>
              <button onClick={() => setStyle(DEFAULT_STYLE)} className="text-[11px] text-[#7C8594] hover:text-[#E9ECF1]">Reset</button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
                <button key={id} onClick={() => setStyle((x) => ({ ...x, basemap: id }))} title={BASEMAPS[id].hint} aria-pressed={style.basemap === id}
                  className={`px-2 py-1.5 rounded border text-[11px] text-left ${style.basemap === id ? 'border-[#2F3A4F] bg-[#2F3A4F]/20 text-[#E9ECF1]' : 'border-[#232936] text-[#9AA3B2] hover:text-[#E9ECF1]'}`}>
                  {BASEMAPS[id].label}
                </button>
              ))}
            </div>
            <span className="text-[10.5px] text-[#6B7383]">{BASEMAPS[style.basemap].hint}</span>
            {([['lighting', 'Day / night shading'], ['atmosphere', 'Atmosphere glow'], ['grid', 'Latitude / longitude grid']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={style[k]} onChange={() => setStyle((x) => ({ ...x, [k]: !x[k] }))}  />
                <span>{label}</span>
              </label>
            ))}
            {([['brightness', 'Brightness', 0.4, 1.8], ['saturation', 'Colour', 0, 2]] as const).map(([k, label, min, max]) => (
              <label key={k} className="flex items-center gap-2">
                <span className="w-[68px] text-[#9AA3B2]">{label}</span>
                <input type="range" min={min} max={max} step={0.05} value={style[k]} onChange={(e) => setStyle((x) => ({ ...x, [k]: Number(e.target.value) }))} className="flex-1" />
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#1A1E27]">
            <span className="text-[12px] text-[#7C8594]">Colour satellites by</span>
            <div className="flex gap-0.5 rounded border border-[#232936] p-0.5" role="group">
              {([['health', 'Health'], ['plane', 'Plane'], ['satellite', 'Satellite']] as const).map(([m, l]) => (
                <button key={m} onClick={() => setColorMode(m)} className={`flex-1 ${seg(colorMode === m)}`} aria-pressed={colorMode === m}>{l}</button>
              ))}
            </div>
            {colorMode === 'plane' && <div className="flex flex-wrap gap-2 text-[11px]">{Object.entries(PLANE_COLOR).map(([p, c]) => <span key={p} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{p}</span>)}</div>}
            {colorMode === 'health' && <div className="flex flex-wrap gap-2 text-[11px]">{Object.entries(HEALTH_COLOR).map(([p, c]) => <span key={p} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{p.toLowerCase()}</span>)}</div>}
            {colorMode === 'satellite' && <span className="text-[11px] text-[#7C8594]">Each satellite has its own colour, shown on its card.</span>}
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#1A1E27]">
            <span className="text-[12px] text-[#7C8594]">Ground stations</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">{STATIONS.map((s) => <span key={s.id} className="flex items-center gap-1"><i className="w-2 h-2 rounded-[2px]" style={{ background: STATION }} />{s.id}</span>)}</div>
            <span className="text-[12px] text-[#7C8594] mt-1">Places</span>
            <div className="flex flex-wrap gap-x-3 text-[11px]">{(['capital', 'city', 'site'] as const).map((k) => <span key={k} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: PLACE_COLOR[k] }} />{k === 'site' ? 'launch / mission site' : k}</span>)}</div>
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#1A1E27]">
            <span className="text-[12px] text-[#7C8594]">Space objects (demo catalogue)</span>
            <div className="flex flex-col gap-0.5 text-[11px]">
              {([['DEBRIS', counts_.debris], ['ROCKET_BODY', counts_.rb], ['DEFUNCT', counts_.dead]] as const).map(([k, n]) => (
                <span key={k} className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full" style={{ background: OBJECT_COLOR[k] }} />{OBJECT_LABEL[k]} <span className="text-[#7C8594] ml-auto">{n}</span></span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#1A1E27]">
            <span className="text-[12px] text-[#7C8594]">Observe one satellite</span>
            {focusSat ? (
              <button onClick={() => observe(null)} className="flex items-center justify-center gap-1.5 h-8 rounded-[10px] bg-[#F28C28] text-[#1A0E02] text-[12.5px] font-semibold"><Eye size={14} /> Observing {focusSat} · show all</button>
            ) : (
              <div className="flex gap-1.5">
                <Select value={selectedSatId} onChange={(e) => selectSat(e.target.value)} aria-label="Satellite to observe" className="flex-1 bg-[#161A22] border border-[#232936] font-mono-code text-[11px] rounded-xl px-2 h-8 text-[#E9ECF1]">
                  <option value="" disabled>Pick a satellite…</option>
                  {satellites.map((s) => <option key={s.sat_id} value={s.sat_id}>{s.sat_id}</option>)}
                </Select>
                <button onClick={() => selectedSatId && observe(selectedSatId)} disabled={!selectedSatId} className="px-2.5 h-8 rounded border border-[#2F3A4F] text-[#6CB8FF] text-[12px] disabled:opacity-40 flex items-center gap-1"><EyeOff size={13} /> Observe</button>
              </div>
            )}
            <span className="text-[11px] text-[#7C8594]">Hides every other satellite and follows this one with the camera.</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-140px)] pointer-events-none text-[11px] text-[#C9CED6]" aria-label="Legend">
        {([['Nominal', HEALTH_COLOR.NOMINAL, 'dot'], ['Warning', HEALTH_COLOR.WARNING, 'dot'], ['Critical', HEALTH_COLOR.CRITICAL, 'dot'], ['In contact', CONTACT, 'halo'], ['Ground station', STATION, 'square']] as const).map(([l, c, k]) => (
          <span key={l} className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-[#11141B]/90 border border-[#232936]">
            <i className={k === 'square' ? 'w-[7px] h-[7px] rounded-[2px]' : 'w-[7px] h-[7px] rounded-full'} style={k === 'halo' ? { background: HEALTH_COLOR.NOMINAL, boxShadow: `0 0 0 2px ${c}` } : { background: c }} />{l}
          </span>
        ))}
        <span className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-[#11141B]/90 border border-[#232936]">
          {Object.values(PLANE_COLOR).map((c) => <i key={c} className="w-2.5 h-[2px] rounded" style={{ background: c }} />)}Orbit
        </span>
        <span className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-[#11141B]/90 border border-[#232936]">
          <i className="w-3 border-t border-dashed" style={{ borderColor: RISK_COLOR.CRITICAL }} />Conjunction
        </span>
      </div>

      {/* Status strip */}
      <div className="absolute bottom-12 left-3 z-10 bg-[#11141B]/90 px-3 py-1.5 rounded-[10px] text-[11px] text-[#9AA3B2] pointer-events-none flex items-center gap-4">
        {focusSat ? <span className="text-[#6CB8FF] font-semibold">Observing {focusSat}</span> : <span>{layers.sats ? satellites.length : 0} satellites</span>}
        <span>{counts.sunlit} sunlit</span>
        <span>{counts.eclipse} in eclipse</span>
        {layers.debris && <span>{objects.length} objects</span>}
      </div>

      {/* Conjunction alerts */}
      {layers.conjunctions && shownConj.length > 0 && !conjOpen && (
        <button type="button" onClick={() => setConjOpen(true)} aria-expanded={false}
          className="absolute bottom-3 right-3 z-20 h-8 px-3 rounded-full bg-[#11141B]/95 border border-[#232936] text-[12px] text-[#E9ECF1] flex items-center gap-2 hover:border-[#2F3A4F]">
          <i className="w-2 h-2 rounded-full" style={{ background: RISK_COLOR[shownConj.some((c) => c.risk === 'CRITICAL') ? 'CRITICAL' : 'WARNING'] }} />
          Conjunctions · {shownConj.length}
        </button>
      )}
      {layers.conjunctions && shownConj.length > 0 && conjOpen && (
        <div className="absolute bottom-3 right-3 z-20 w-[330px] max-w-[calc(100%-24px)] max-h-[45%] overflow-y-auto bg-[#11141B] border border-[#232936] rounded-xl p-2.5 text-[11.5px] shadow-2xl">
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
            <span className="font-semibold text-[#E9ECF1]">Conjunctions · next 4 h</span>
            <span className="text-[#7C8594] ml-auto">{shownConj.length} under 25 km</span>
            <button type="button" onClick={() => setConjOpen(false)} aria-label="Collapse conjunctions" className="text-[#9AA3B2] hover:text-[#E9ECF1]"><X size={14} /></button>
          </div>
          {shownConj.slice(0, 8).map((c) => (
            <button key={`${c.satId}${c.objectId}`} onClick={() => selectConj(c)}
              className={`w-full text-left rounded-md px-2 py-1.5 flex items-start gap-2 hover:bg-[#171B24] ${highlight === c ? 'bg-[#171B24]' : ''}`}>
              <i className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: RISK_COLOR[c.risk] }} />
              <span className="flex-1 min-w-0">
                <span className="block font-mono-code text-[#E9ECF1] truncate">{c.satId} × {c.objectName}</span>
                <span className="block text-[#7C8594]">in {fmtIn(c.tcaMs - Date.now())} · <b className="text-[#E9ECF1]">{c.missKm.toFixed(1)} km</b> · {c.relSpeedKms.toFixed(1)} km/s</span>
              </span>
              <span className="text-[11px]" style={{ color: RISK_COLOR[c.risk] }}>{c.risk.charAt(0) + c.risk.slice(1).toLowerCase()}</span>
            </button>
          ))}
          <p className="px-1 pt-1.5 text-[10.5px] text-[#6B7383]">Screening is real geometry against a demo catalogue, not live tracking data.</p>
        </div>
      )}

      {/* Selected space object */}
      {objInfo && objState && (
        <div className="absolute bottom-24 left-3 z-20 w-[260px] bg-[#11141B] border border-[#232936] rounded-xl p-3 text-[11.5px] font-mono-code shadow-2xl flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-bold flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: OBJECT_COLOR[objInfo.kind] }} />{objInfo.name}</span>
            <button onClick={() => setSelectedObject(null)} aria-label="Close" className="text-[#9AA3B2] hover:text-[#E9ECF1]"><X size={14} /></button>
          </div>
          <span className="text-[#7C8594]">{OBJECT_LABEL[objInfo.kind]} · {objInfo.group}</span>
          <div className="flex justify-between"><span className="text-[#7C8594]">Altitude</span><b>{objState.altKm.toFixed(0)} km</b></div>
          <div className="flex justify-between"><span className="text-[#7C8594]">Speed</span><b>{objState.speedKms.toFixed(2)} km/s</b></div>
          <div className="flex justify-between"><span className="text-[#7C8594]">Inclination</span><b>{(objInfo.el.inc * 180 / Math.PI).toFixed(1)}°</b></div>
          <div className="flex justify-between"><span className="text-[#7C8594]">Position</span><b>{Math.abs(objState.lat).toFixed(1)}° {objState.lat >= 0 ? 'N' : 'S'}, {Math.abs(objState.lon).toFixed(1)}° {objState.lon >= 0 ? 'E' : 'W'}</b></div>
          {objConj.length > 0 && <span className="text-[#F59E0B] pt-1">Approaches {objConj[0].satId} to {objConj[0].missKm.toFixed(1)} km in {fmtIn(objConj[0].tcaMs - Date.now())}</span>}
        </div>
      )}

      {showInspector && activeSat && selectedSatId && (
        <SatelliteDetailCard
          sat={activeSat as Satellite & { tenant?: string }}
          getMs={() => baseMsRef.current + animTimeRef.current * 1000}
          locked={isCameraLocked}
          canLock={is3D}
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
