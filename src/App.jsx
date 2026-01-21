import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Map, { Source, Layer, Marker, Popup } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, AlertTriangle, Activity, Radio, Clock, Brain, Target,
  ShoppingBag, DoorOpen, Scan, CheckCircle, Lock, Users, Camera,
  Beer, Eye, Ticket, TrendingUp, MapPin, AlertCircle, Footprints
} from 'lucide-react';

// ============================================
// CONFIGURATION - LUCAS OIL STADIUM
// ============================================
const MAPBOX_TOKEN = 'pk.eyJ1IjoibWF2bGFicyIsImEiOiJjbWtuYWlqeW4wYzlxM2ZvZ25ja3M0YWt0In0.KWoG8qmwL0fbAoER0zQrgw';
const SIMULATION_TICK_RATE = 800;
const MOVEMENT_SPEED = 0.00008;
const ENTITY_COUNT = 150;

// Lucas Oil Stadium, Indianapolis
const MAP_CENTER = {
  longitude: -86.1636,
  latitude: 39.7601,
  zoom: 17.5,
};

const BOUNDS = {
  minLng: -86.1660, maxLng: -86.1610,
  minLat: 39.7585, maxLat: 39.7620
};

// ============================================
// GAME PHASES
// ============================================
const GAME_PHASES = [
  { phase: 'PRE_GAME', label: 'Pre-Game', duration: 20, crowdDensity: 0.4, color: 'cyan' },
  { phase: 'KICKOFF', label: 'Kickoff!', duration: 10, crowdDensity: 0.95, color: 'emerald' },
  { phase: 'Q1', label: '1st Quarter', duration: 40, crowdDensity: 0.9, color: 'emerald' },
  { phase: 'Q2', label: '2nd Quarter', duration: 40, crowdDensity: 0.88, color: 'emerald' },
  { phase: 'HALFTIME', label: 'Halftime', duration: 25, crowdDensity: 0.5, color: 'amber' },
  { phase: 'Q3', label: '3rd Quarter', duration: 40, crowdDensity: 0.85, color: 'emerald' },
  { phase: 'Q4', label: '4th Quarter', duration: 40, crowdDensity: 0.8, color: 'emerald' },
  { phase: 'POST_GAME', label: 'Post-Game', duration: 30, crowdDensity: 0.3, color: 'slate' },
];

// ============================================
// STADIUM ZONES (GeoJSON) - Approximate Layout
// ============================================
const geoJsonData = {
  type: 'FeatureCollection',
  features: [
    // Main Stadium Bowl (Public)
    {
      type: 'Feature',
      properties: { name: 'Stadium Bowl', zoneType: 'public', id: 'bowl' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-86.1655, 39.7615], [-86.1617, 39.7615],
          [-86.1617, 39.7588], [-86.1655, 39.7588],
          [-86.1655, 39.7615],
        ]],
      },
    },
    // Field Level (Restricted)
    {
      type: 'Feature',
      properties: { name: 'Field Level', zoneType: 'restricted', id: 'field' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-86.1648, 39.7608], [-86.1624, 39.7608],
          [-86.1624, 39.7594], [-86.1648, 39.7594],
          [-86.1648, 39.7608],
        ]],
      },
    },
    // VIP Suites - North
    {
      type: 'Feature',
      properties: { name: 'VIP Suites North', zoneType: 'vip', id: 'vip-north' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-86.1650, 39.7615], [-86.1622, 39.7615],
          [-86.1622, 39.7611], [-86.1650, 39.7611],
          [-86.1650, 39.7615],
        ]],
      },
    },
    // VIP Suites - South
    {
      type: 'Feature',
      properties: { name: 'VIP Suites South', zoneType: 'vip', id: 'vip-south' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-86.1650, 39.7591], [-86.1622, 39.7591],
          [-86.1622, 39.7587], [-86.1650, 39.7587],
          [-86.1650, 39.7591],
        ]],
      },
    },
    // Tunnel/Locker (Critical)
    {
      type: 'Feature',
      properties: { name: 'Team Tunnel', zoneType: 'critical', id: 'tunnel' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-86.1638, 39.7594], [-86.1634, 39.7594],
          [-86.1634, 39.7588], [-86.1638, 39.7588],
          [-86.1638, 39.7594],
        ]],
      },
    },
    // Concourse - East
    {
      type: 'Feature',
      properties: { name: 'East Concourse', zoneType: 'concourse', id: 'concourse-e' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-86.1620, 39.7612], [-86.1615, 39.7612],
          [-86.1615, 39.7590], [-86.1620, 39.7590],
          [-86.1620, 39.7612],
        ]],
      },
    },
    // Concourse - West
    {
      type: 'Feature',
      properties: { name: 'West Concourse', zoneType: 'concourse', id: 'concourse-w' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-86.1657, 39.7612], [-86.1652, 39.7612],
          [-86.1652, 39.7590], [-86.1657, 39.7590],
          [-86.1657, 39.7612],
        ]],
      },
    },
  ],
};

// ============================================
// HELPERS
// ============================================
function isPointInPolygon(point, vs) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const getZoneForPoint = (lng, lat) => {
  for (const feature of geoJsonData.features) {
    const coords = feature.geometry.coordinates[0];
    if (isPointInPolygon([lng, lat], coords)) {
      return feature.properties;
    }
  }
  return { zoneType: 'outside', name: 'Outside' };
};

const FIRST_NAMES = ['Mike', 'John', 'Sarah', 'Emily', 'David', 'Chris', 'Alex', 'Sam', 'Jordan', 'Taylor', 'Pat', 'Casey', 'Morgan', 'Drew', 'Jamie'];
const LAST_INITIALS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'W'];

const TICKET_TYPES = ['general', 'general', 'general', 'general', 'general', 'vip', 'staff', 'media', 'vendor'];
const STADIUM_ITEMS = ['Hot Dog', 'Nachos', 'Pretzel', 'Popcorn', 'Soda', 'Water', 'Foam Finger', 'Jersey', 'Program'];
const ALCOHOL_ITEMS = ['Beer', 'Beer', 'Hard Seltzer', 'Mixed Drink'];

// ============================================
// THREAT SCORING ENGINE
// ============================================
const calculateThreatScore = (entity, gamePhase) => {
  let score = 0;
  const factors = [];

  // Historical factors
  if (entity.history.watchlistStatus === 'high') {
    score += 35;
    factors.push('HIGH WATCHLIST');
  } else if (entity.history.watchlistStatus === 'low') {
    score += 15;
    factors.push('Low Watchlist');
  }

  if (entity.history.priorIncidents > 0) {
    score += entity.history.priorIncidents * 12;
    factors.push(`${entity.history.priorIncidents} Prior Incident(s)`);
  }

  if (entity.history.alcoholPattern === 'heavy') {
    score += 10;
    factors.push('Heavy Drinker History');
  }

  // Session factors
  if (entity.session.alcoholCount >= 6) {
    score += 30;
    factors.push('Excessive Alcohol (6+)');
  } else if (entity.session.alcoholCount >= 4) {
    score += 18;
    factors.push('High Alcohol (4+)');
  } else if (entity.session.alcoholCount >= 3) {
    score += 8;
  }

  // Zone violations
  const zone = getZoneForPoint(entity.longitude, entity.latitude);
  if (zone.zoneType === 'critical' && entity.ticketType !== 'staff') {
    score += 45;
    factors.push('CRITICAL ZONE VIOLATION');
  } else if (zone.zoneType === 'restricted' && !['staff', 'media'].includes(entity.ticketType)) {
    score += 30;
    factors.push('Restricted Zone Access');
  } else if (zone.zoneType === 'vip' && entity.ticketType !== 'vip' && entity.ticketType !== 'staff') {
    score += 20;
    factors.push('VIP Zone - No Auth');
  }

  // Behavioral
  if (entity.status === 'rushing') {
    score += 15;
    factors.push('Rushing Behavior');
  }
  if (entity.status === 'loitering' && zone.zoneType !== 'concourse') {
    score += 10;
    factors.push('Loitering');
  }

  // User watchlist
  if (entity.session.isWatched) {
    score += 5;
    factors.push('User Flagged');
  }

  return {
    score: Math.min(100, score),
    level: score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW',
    factors
  };
};

// ============================================
// ENTITY GENERATOR
// ============================================
// Field restricted zone boundaries (to avoid)
const FIELD_BOUNDS = {
  minLng: -86.1649, maxLng: -86.1623,
  minLat: 39.7593, maxLat: 39.7609
};

// Check if a point is inside the restricted field area
const isInRestrictedField = (lng, lat) => {
  return lng > FIELD_BOUNDS.minLng && lng < FIELD_BOUNDS.maxLng &&
         lat > FIELD_BOUNDS.minLat && lat < FIELD_BOUNDS.maxLat;
};

// Get random position in ALLOWED zones only (not field/tunnel)
const getRandomPos = (zonePreference = null) => {
  if (zonePreference === 'concourse') {
    const isEast = Math.random() > 0.5;
    return {
      longitude: isEast ? -86.1618 + Math.random() * 0.0003 : -86.1654 + Math.random() * 0.0003,
      latitude: 39.7592 + Math.random() * 0.0018
    };
  }

  // Generate position in seating areas (clearly outside the field)
  const section = Math.random();
  let pos;

  if (section < 0.25) {
    // North seating (ABOVE the field - lat > 39.7609)
    pos = {
      longitude: -86.1652 + Math.random() * 0.0030,
      latitude: 39.7610 + Math.random() * 0.0004
    };
  } else if (section < 0.5) {
    // South seating (BELOW the field - lat < 39.7593)
    pos = {
      longitude: -86.1652 + Math.random() * 0.0030,
      latitude: 39.7586 + Math.random() * 0.0006
    };
  } else if (section < 0.75) {
    // East seating (RIGHT of field - lng > -86.1623)
    pos = {
      longitude: -86.1621 + Math.random() * 0.0006,
      latitude: 39.7594 + Math.random() * 0.0014
    };
  } else {
    // West seating (LEFT of field - lng < -86.1649)
    pos = {
      longitude: -86.1656 + Math.random() * 0.0006,
      latitude: 39.7594 + Math.random() * 0.0014
    };
  }

  return pos;
};

const generateEntities = (count) => {
  const entities = [];

  for (let i = 0; i < count; i++) {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastInit = LAST_INITIALS[Math.floor(Math.random() * LAST_INITIALS.length)];
    const ticketType = TICKET_TYPES[Math.floor(Math.random() * TICKET_TYPES.length)];

    // Determine spawn location based on ticket
    const spawnZone = ticketType === 'vendor' ? 'concourse' : null;
    const pos = getRandomPos(spawnZone);

    // Generate history - most people are normal, few are flagged
    const isTroublesome = Math.random() < 0.08; // 8% chance
    const isWatchlisted = Math.random() < 0.05; // 5% chance

    entities.push({
      id: `fan-${1000 + i}`,
      name: `${firstName} ${lastInit}.`,
      ticketType,
      ...pos,
      target: getRandomPos(),
      status: 'normal',
      waitTicks: 0,
      inventory: [],

      // Basic History
      history: {
        priorIncidents: isTroublesome ? Math.floor(Math.random() * 3) + 1 : 0,
        watchlistStatus: isWatchlisted ? (Math.random() > 0.5 ? 'high' : 'low') : 'none',
        alcoholPattern: Math.random() < 0.15 ? 'heavy' : 'normal'
      },

      // Current Session
      session: {
        alcoholCount: 0,
        zonesVisited: [],
        isWatched: false
      },

      threatScore: 0,
      threatLevel: 'LOW',
      threatFactors: []
    });
  }

  return entities;
};

// ============================================
// UI COMPONENTS
// ============================================
const Icon = ({ name, className }) => {
  const map = {
    activity: Activity, scan: Scan, shopping: ShoppingBag,
    target: Target, door: DoorOpen, brain: Brain,
    alert: AlertTriangle, check: CheckCircle, lock: Lock,
    users: Users, camera: Camera, beer: Beer, eye: Eye,
    ticket: Ticket, trend: TrendingUp, pin: MapPin,
    warning: AlertCircle, footprints: Footprints
  };
  const Cmp = map[name] || Activity;
  return <Cmp className={className} />;
};

const ThreatGauge = ({ score, size = 'md' }) => {
  const color = score >= 70 ? '#ef4444' : score >= 45 ? '#f97316' : score >= 25 ? '#eab308' : '#22c55e';
  const sizeClass = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className={`w-full bg-slate-700 rounded-full ${sizeClass} overflow-hidden`}>
      <motion.div
        className={`${sizeClass} rounded-full`}
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.5 }}
      />
    </div>
  );
};

const Header = ({ threatLevel, time, gamePhase, watchlistCount, alertCount }) => {
  const phaseInfo = GAME_PHASES.find(p => p.phase === gamePhase) || GAME_PHASES[0];

  return (
    <div className={`h-16 px-6 flex items-center justify-between border-b transition-colors duration-500 ${
      threatLevel === 'CRITICAL' ? 'bg-red-950/80 border-red-800' :
      threatLevel === 'HIGH' ? 'bg-orange-950/80 border-orange-800' :
      'bg-slate-900/80 border-slate-800'
    }`}>
      <div className="flex items-center gap-4">
        <Shield className={`w-8 h-8 ${threatLevel === 'CRITICAL' ? 'text-red-500 animate-pulse' : 'text-cyan-500'}`} />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            EventSentinel <span className="text-xs font-mono opacity-50">STADIUM</span>
          </h1>
          <p className="text-xs text-slate-400">Lucas Oil Stadium - Indianapolis Colts</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Game Phase Badge */}
        <div className={`px-3 py-1.5 rounded-lg border bg-${phaseInfo.color}-500/10 border-${phaseInfo.color}-500/50`}>
          <div className="text-[10px] text-slate-400 uppercase">Game Phase</div>
          <div className={`text-sm font-bold text-${phaseInfo.color}-400`}>{phaseInfo.label}</div>
        </div>

        {/* Time */}
        <div className="flex items-center gap-2 text-sm font-mono text-slate-400 px-3">
          <Clock className="w-4 h-4" /> {time}
        </div>

        {/* Watchlist Count */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500/10 border border-amber-500/30">
          <Eye className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-amber-400">{watchlistCount}</span>
        </div>

        {/* Alerts */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded ${
          alertCount > 0 ? 'bg-red-500/20 border border-red-500/50' : 'bg-slate-800/50 border border-slate-700'
        }`}>
          <AlertTriangle className={`w-4 h-4 ${alertCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-500'}`} />
          <span className={`text-sm font-bold ${alertCount > 0 ? 'text-red-400' : 'text-slate-500'}`}>{alertCount}</span>
        </div>

        {/* Status Badge */}
        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
          threatLevel === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border-red-500' :
          threatLevel === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border-orange-500' :
          'bg-emerald-500/20 text-emerald-400 border-emerald-500'
        }`}>
          {threatLevel === 'CRITICAL' ? 'CRITICAL' : threatLevel === 'HIGH' ? 'ELEVATED' : 'NOMINAL'}
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN APPLICATION
// ============================================
export default function App() {
  const [entities, setEntities] = useState(() => generateEntities(ENTITY_COUNT));
  const [logs, setLogs] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [systemThreatLevel, setSystemThreatLevel] = useState('LOW');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [time, setTime] = useState(new Date());
  const [gamePhaseIndex, setGamePhaseIndex] = useState(0);
  const [phaseTick, setPhaseTick] = useState(0);

  const mapRef = useRef(null);

  const currentPhase = GAME_PHASES[gamePhaseIndex];

  // Initial logs on mount
  useEffect(() => {
    addLog('system', 'System Online', 'EventSentinel STADIUM initialized', 'check');
    addLog('info', 'Crowd Analysis', `Tracking ${ENTITY_COUNT} individuals in venue`, 'users');
    addLog('info', 'Game Status', 'Pre-game operations active', 'activity');

    // Find any pre-flagged entities
    const flagged = entities.filter(e => e.history.watchlistStatus !== 'none');
    if (flagged.length > 0) {
      addLog('alert', 'Watchlist Alert', `${flagged.length} known individuals detected in venue`, 'eye');
    }
  }, []); // Run once on mount

  // Computed values
  const watchlistCount = useMemo(() =>
    entities.filter(e => e.session.isWatched).length, [entities]);

  const highRiskEntities = useMemo(() =>
    entities.filter(e => e.threatScore >= 45).sort((a, b) => b.threatScore - a.threatScore), [entities]);

  const alertCount = useMemo(() =>
    entities.filter(e => e.threatLevel === 'CRITICAL').length, [entities]);

  // Logging
  const addLog = useCallback((type, title, desc, icon = 'activity') => {
    const newLog = {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString('en-US', {hour12: false}),
      type, title, desc, icon
    };
    setLogs(prev => [newLog, ...prev].slice(0, 40));
  }, []);

  // Prediction action suggestions
  const PREDICTION_ACTIONS = {
    'ZONE_BREACH_IMMINENT': { action: 'Deploy security to perimeter', priority: 'HIGH', icon: 'alert' },
    'ALTERCATION_RISK': { action: 'Alert nearby staff for intervention', priority: 'HIGH', icon: 'users' },
    'FIELD_RUSH_VECTOR': { action: 'Position guards at field access points', priority: 'CRITICAL', icon: 'alert' },
    'INTOXICATION_MONITOR': { action: 'Flag for beverage service cutoff', priority: 'MEDIUM', icon: 'beer' },
    'BEHAVIORAL_PATTERN_MATCH': { action: 'Increase surveillance on subject', priority: 'MEDIUM', icon: 'eye' },
    'ANOMALY_DETECTED': { action: 'Continue monitoring, gather data', priority: 'LOW', icon: 'scan' },
  };

  const addPrediction = useCallback((entity, prediction, confidence) => {
    setPredictions(prev => {
      // Don't add duplicate predictions for same entity within short time
      const isDuplicate = prev.some(p =>
        p.entityId === entity.id &&
        p.prediction === prediction &&
        Date.now() - p.timestamp < 10000 // 10 second cooldown
      );
      if (isDuplicate) return prev;

      const actionInfo = PREDICTION_ACTIONS[prediction] || { action: 'Monitor situation', priority: 'LOW', icon: 'activity' };

      const newPred = {
        id: `${entity.id}-${prediction}-${Date.now()}`,
        timestamp: Date.now(),
        entityId: entity.id,
        entityName: entity.name,
        prediction,
        confidence,
        factors: entity.threatFactors || [],
        action: actionInfo.action,
        priority: actionInfo.priority,
        icon: actionInfo.icon,
        time: new Date().toLocaleTimeString('en-US', {hour12: false})
      };

      // Keep max 5, sorted by priority then confidence
      const updated = [newPred, ...prev].slice(0, 5);
      return updated;
    });
  }, []);

  // Toggle watchlist for entity
  const toggleWatchlist = useCallback((entityId) => {
    setEntities(prev => prev.map(e => {
      if (e.id === entityId) {
        const newWatched = !e.session.isWatched;
        if (newWatched) {
          addLog('alert', 'Watchlist Added', `${e.name} added to active surveillance`, 'eye');
        } else {
          addLog('info', 'Watchlist Removed', `${e.name} removed from surveillance`, 'check');
        }
        return { ...e, session: { ...e.session, isWatched: newWatched } };
      }
      return e;
    }));
    setSelectedEntity(prev => prev ? { ...prev, session: { ...prev.session, isWatched: !prev.session.isWatched } } : null);
  }, [addLog]);

  // Handle clicking on a prediction - select the entity
  const handlePredictionClick = useCallback((pred) => {
    const entity = entities.find(e => e.id === pred.entityId);
    if (entity) {
      setSelectedEntity(entity);
      addLog('info', 'Entity Selected', `Viewing ${pred.entityName} from prediction`, 'target');
    }
  }, [entities, addLog]);

  // Dismiss/acknowledge a prediction
  const dismissPrediction = useCallback((predId) => {
    setPredictions(prev => prev.filter(p => p.id !== predId));
    addLog('info', 'Prediction Acknowledged', 'Alert dismissed by operator', 'check');
  }, [addLog]);

  // Map data layers
  const heatmapData = useMemo(() => ({
    type: 'FeatureCollection',
    features: entities.map(e => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
      properties: { weight: e.threatScore > 45 ? 3 : 1 }
    }))
  }), [entities]);

  const groupLinks = useMemo(() => {
    const lines = [];
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i], e2 = entities[j];
        const dist = Math.sqrt(Math.pow(e1.longitude - e2.longitude, 2) + Math.pow(e1.latitude - e2.latitude, 2));
        if (dist < 0.0004) {
          lines.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[e1.longitude, e1.latitude], [e2.longitude, e2.latitude]] }
          });
        }
      }
    }
    return { type: 'FeatureCollection', features: lines };
  }, [entities]);

  // ============================================
  // MAIN SIMULATION LOOP
  // ============================================
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());

      // Advance game phase
      setPhaseTick(prev => {
        const next = prev + 1;
        if (next >= currentPhase.duration) {
          setGamePhaseIndex(pi => (pi + 1) % GAME_PHASES.length);
          return 0;
        }
        return next;
      });

      setEntities(prevEntities => {
        let maxThreat = 'LOW';

        const nextEntities = prevEntities.map(entity => {
          let { longitude, latitude, target, inventory, waitTicks, status, session } = entity;
          const isAuthorized = ['staff', 'media'].includes(entity.ticketType);

          // FIRST: If entity is inside restricted field and not authorized, push them out immediately
          if (isInRestrictedField(longitude, latitude) && !isAuthorized) {
            // Teleport to nearest seating area
            const pos = getRandomPos();
            longitude = pos.longitude;
            latitude = pos.latitude;
            target = getRandomPos();
          }

          // Also ensure target is never inside the field for unauthorized
          if (isInRestrictedField(target.longitude, target.latitude) && !isAuthorized) {
            target = getRandomPos();
          }

          // Waiting (idle behavior)
          if (waitTicks > 0) {
            return { ...entity, waitTicks: waitTicks - 1, longitude, latitude, target };
          }

          // Random idle chance
          if (Math.random() > 0.97 && status === 'normal') {
            return { ...entity, status: 'loitering', waitTicks: Math.floor(Math.random() * 8) + 3, longitude, latitude, target };
          }

          // Movement
          const dLon = target.longitude - longitude;
          const dLat = target.latitude - latitude;
          const dist = Math.sqrt(dLon * dLon + dLat * dLat);

          if (dist < MOVEMENT_SPEED * 2) {
            // Halftime: go to concourse
            if (currentPhase.phase === 'HALFTIME' && Math.random() > 0.5) {
              target = getRandomPos('concourse');
            } else {
              target = getRandomPos();
            }
          } else {
            const speed = status === 'rushing' ? MOVEMENT_SPEED * 2 : MOVEMENT_SPEED;
            const newLon = longitude + (dLon / dist) * speed;
            const newLat = latitude + (dLat / dist) * speed;

            // Don't move into restricted field
            if (!isInRestrictedField(newLon, newLat) || isAuthorized) {
              // Check VIP zones
              const newZone = getZoneForPoint(newLon, newLat);
              if (newZone.zoneType === 'vip' && entity.ticketType !== 'vip' && !isAuthorized) {
                target = getRandomPos();
              } else {
                longitude = newLon;
                latitude = newLat;
              }
            } else {
              // Would enter field - redirect
              target = getRandomPos();
            }
          }

          // Zone tracking
          const zone = getZoneForPoint(longitude, latitude);
          if (!session.zonesVisited.includes(zone.id)) {
            session = { ...session, zonesVisited: [...session.zonesVisited, zone.id] };
          }

          // Concourse purchases (during halftime more likely)
          const purchaseChance = currentPhase.phase === 'HALFTIME' ? 0.88 : 0.96;
          if (zone.zoneType === 'concourse' && Math.random() > purchaseChance) {
            const isBeer = entity.history.alcoholPattern === 'heavy' ? Math.random() > 0.3 : Math.random() > 0.6;

            if (isBeer && session.alcoholCount < 8) {
              const drink = ALCOHOL_ITEMS[Math.floor(Math.random() * ALCOHOL_ITEMS.length)];
              inventory = [...inventory, drink];
              session = { ...session, alcoholCount: session.alcoholCount + 1 };

              if (session.alcoholCount >= 4) {
                addLog('alert', 'Alcohol Alert', `${entity.name} - ${session.alcoholCount} drinks purchased`, 'beer');
              } else if (session.alcoholCount === 1) {
                addLog('info', 'Concession', `${entity.name} purchased ${drink}`, 'shopping');
              }
            } else {
              const item = STADIUM_ITEMS[Math.floor(Math.random() * STADIUM_ITEMS.length)];
              if (!inventory.includes(item)) {
                inventory = [...inventory, item];
                if (Math.random() > 0.7) {
                  addLog('info', 'Concession', `${entity.name} purchased ${item}`, 'shopping');
                }
              }
            }
          }

          // Log zone transitions occasionally
          if (zone.id && !session.zonesVisited.includes(zone.id) && Math.random() > 0.85) {
            if (zone.zoneType === 'vip' && entity.ticketType === 'vip') {
              addLog('info', 'VIP Access', `${entity.name} entered ${zone.name}`, 'ticket');
            } else if (zone.zoneType === 'concourse') {
              addLog('info', 'Movement', `${entity.name} entered concourse area`, 'footprints');
            }
          }

          // Rushing behavior (random or zone violation attempt)
          if (Math.random() > 0.995) {
            status = Math.random() > 0.7 ? 'rushing' : 'normal';
          }

          // Calculate threat score
          const tempEntity = { ...entity, longitude, latitude, inventory, session, status };
          const threat = calculateThreatScore(tempEntity, currentPhase.phase);

          // Update max threat
          if (threat.level === 'CRITICAL') maxThreat = 'CRITICAL';
          else if (threat.level === 'HIGH' && maxThreat !== 'CRITICAL') maxThreat = 'HIGH';

          // Generate predictions for elevated risk entities (less frequent for stability)
          if (threat.score >= 40 && Math.random() > 0.96) {
            let pred, confidence;
            if (threat.score >= 60) {
              const highRiskPreds = ['ZONE_BREACH_IMMINENT', 'ALTERCATION_RISK', 'FIELD_RUSH_VECTOR'];
              pred = highRiskPreds[Math.floor(Math.random() * highRiskPreds.length)];
              confidence = Math.floor(70 + Math.random() * 25);
            } else if (session.alcoholCount >= 3) {
              pred = 'INTOXICATION_MONITOR';
              confidence = Math.floor(50 + session.alcoholCount * 8);
            } else if (entity.history.priorIncidents > 0) {
              pred = 'BEHAVIORAL_PATTERN_MATCH';
              confidence = Math.floor(45 + Math.random() * 30);
            } else {
              pred = 'ANOMALY_DETECTED';
              confidence = Math.floor(40 + Math.random() * 25);
            }
            addPrediction(tempEntity, pred, confidence);
          }

          return {
            ...entity,
            longitude, latitude, target, inventory, status, session, waitTicks,
            threatScore: threat.score,
            threatLevel: threat.level,
            threatFactors: threat.factors
          };
        });

        setSystemThreatLevel(maxThreat);
        return nextEntities;
      });
    }, SIMULATION_TICK_RATE);

    return () => clearInterval(interval);
  }, [currentPhase, addLog, addPrediction]);

  // Entity marker color
  const getEntityColor = (e) => {
    if (e.id === selectedEntity?.id) return '#ffffff';
    if (e.session.isWatched) return '#f59e0b'; // Amber for watched
    if (e.threatLevel === 'CRITICAL') return '#ef4444';
    if (e.threatLevel === 'HIGH') return '#f97316';
    if (e.ticketType === 'staff') return '#22c55e';
    if (e.ticketType === 'vip') return '#a855f7';
    return '#06b6d4';
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <Header
        threatLevel={systemThreatLevel}
        time={time.toLocaleTimeString()}
        gamePhase={currentPhase.phase}
        watchlistCount={watchlistCount}
        alertCount={alertCount}
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden relative">

        {/* === LEFT: INTELLIGENCE LOG === */}
        <div className="hidden lg:flex col-span-1 flex-col border-r border-slate-800 bg-slate-900/50">
          <div className="p-3 border-b border-slate-800 font-semibold text-xs text-slate-400 uppercase tracking-wider flex justify-between">
            <span>Live Intelligence Feed</span>
            <Radio className={`w-4 h-4 ${systemThreatLevel === 'CRITICAL' ? 'text-red-500 animate-ping' : 'text-emerald-500'}`} />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence initial={false}>
              {logs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`p-2.5 rounded border-l-2 text-xs ${
                    log.type === 'critical' ? 'bg-red-950/40 border-red-500' :
                    log.type === 'alert' ? 'bg-amber-950/30 border-amber-500' :
                    'bg-slate-800/40 border-slate-600'
                  }`}
                >
                  <div className="flex justify-between text-slate-500 mb-1 font-mono text-[10px]">
                    <span>{log.time}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Icon name={log.icon} className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                      log.type === 'critical' ? 'text-red-400' :
                      log.type === 'alert' ? 'text-amber-400' : 'text-slate-400'
                    }`} />
                    <div>
                      <div className="font-semibold text-slate-200">{log.title}</div>
                      <div className="text-slate-400 leading-tight mt-0.5">{log.desc}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* === CENTER: DIGITAL TWIN MAP === */}
        <div className="col-span-1 lg:col-span-2 relative border-r border-slate-800">
          {/* Legend */}
          <div className="absolute top-4 left-4 z-10 bg-slate-900/95 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl">
            <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase">Stadium Zones</div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500/30 border border-blue-500 rounded-sm" />
                <span>Public/Seating</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500/30 border border-cyan-500 rounded-sm" />
                <span>Concourse</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500/30 border border-amber-500 rounded-sm" />
                <span>VIP Suites</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500/30 border border-red-500 rounded-sm" />
                <span>Field (Restricted)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500/50 border border-purple-500 rounded-sm" />
                <span>Tunnel (Critical)</span>
              </div>
            </div>
          </div>

          {/* Critical overlay */}
          <AnimatePresence>
            {systemThreatLevel === 'CRITICAL' && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-0 bg-red-900 pointer-events-none"
              />
            )}
          </AnimatePresence>

          <Map
            initialViewState={MAP_CENTER}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            ref={mapRef}
          >
            {/* Zone layers */}
            <Source id="zones" type="geojson" data={geoJsonData}>
              <Layer id="public-fill" type="fill" filter={['==', 'zoneType', 'public']} paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.08 }} />
              <Layer id="concourse-fill" type="fill" filter={['==', 'zoneType', 'concourse']} paint={{ 'fill-color': '#06b6d4', 'fill-opacity': 0.12 }} />
              <Layer id="vip-fill" type="fill" filter={['==', 'zoneType', 'vip']} paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.15 }} />
              <Layer id="restricted-fill" type="fill" filter={['==', 'zoneType', 'restricted']} paint={{ 'fill-color': '#ef4444', 'fill-opacity': 0.12 }} />
              <Layer id="critical-fill" type="fill" filter={['==', 'zoneType', 'critical']} paint={{ 'fill-color': '#a855f7', 'fill-opacity': 0.25 }} />
              <Layer id="zone-lines" type="line" paint={{
                'line-color': ['match', ['get', 'zoneType'],
                  'restricted', '#ef4444',
                  'critical', '#a855f7',
                  'vip', '#f59e0b',
                  'concourse', '#06b6d4',
                  '#3b82f6'
                ],
                'line-width': 1.5,
                'line-dasharray': [3, 2]
              }} />
            </Source>

            {/* Heatmap */}
            <Source id="density" type="geojson" data={heatmapData}>
              <Layer
                id="crowd-heat"
                type="heatmap"
                paint={{
                  'heatmap-weight': ['get', 'weight'],
                  'heatmap-intensity': 0.8,
                  'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(0,0,0,0)',
                    0.3, 'rgba(56, 189, 248, 0.2)',
                    0.6, 'rgba(251, 191, 36, 0.3)',
                    1, 'rgba(239, 68, 68, 0.4)'
                  ],
                  'heatmap-radius': 25,
                  'heatmap-opacity': 0.5
                }}
              />
            </Source>

            {/* Group connections */}
            <Source id="groups" type="geojson" data={groupLinks}>
              <Layer id="group-lines" type="line" paint={{ 'line-color': '#64748b', 'line-width': 1, 'line-opacity': 0.25 }} />
            </Source>

            {/* Entity markers */}
            {entities.map((ent) => (
              <Marker key={ent.id} longitude={ent.longitude} latitude={ent.latitude} anchor="center">
                <motion.div
                  className="cursor-pointer group relative"
                  onClick={(e) => { e.stopPropagation(); setSelectedEntity(ent); }}
                  whileHover={{ scale: 1.4 }}
                >
                  {/* Watchlist ring */}
                  {ent.session.isWatched && (
                    <div className="absolute -inset-2 border-2 border-amber-500 rounded-full animate-pulse opacity-70" />
                  )}
                  {/* Critical pulse */}
                  {ent.threatLevel === 'CRITICAL' && (
                    <motion.div
                      className="absolute -inset-3 bg-red-500 rounded-full"
                      animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                  {/* The dot */}
                  <div
                    className="w-2.5 h-2.5 rounded-full border shadow-lg"
                    style={{ backgroundColor: getEntityColor(ent), borderColor: '#0f172a' }}
                  />
                </motion.div>
              </Marker>
            ))}

            {/* Selected entity popup */}
            {selectedEntity && (
              <Popup
                longitude={selectedEntity.longitude}
                latitude={selectedEntity.latitude}
                anchor="top"
                closeButton={false}
                closeOnClick={false}
                offset={15}
              >
                <div className="bg-slate-900 text-slate-200 p-4 rounded-lg shadow-2xl border border-slate-700 text-xs w-64">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3 pb-2 border-b border-slate-700">
                    <div>
                      <div className="font-bold text-sm">{selectedEntity.name}</div>
                      <div className="text-slate-500 font-mono text-[10px]">{selectedEntity.id}</div>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      selectedEntity.ticketType === 'vip' ? 'bg-purple-500/20 text-purple-400' :
                      selectedEntity.ticketType === 'staff' ? 'bg-green-500/20 text-green-400' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {selectedEntity.ticketType}
                    </div>
                  </div>

                  {/* Threat Score */}
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-400">Threat Score</span>
                      <span className={`font-bold ${
                        selectedEntity.threatLevel === 'CRITICAL' ? 'text-red-400' :
                        selectedEntity.threatLevel === 'HIGH' ? 'text-orange-400' :
                        selectedEntity.threatLevel === 'MEDIUM' ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {selectedEntity.threatScore}/100 ({selectedEntity.threatLevel})
                      </span>
                    </div>
                    <ThreatGauge score={selectedEntity.threatScore} />
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-slate-800/50 p-2 rounded">
                      <div className="text-[10px] text-slate-500">Prior Incidents</div>
                      <div className={`font-bold ${selectedEntity.history.priorIncidents > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                        {selectedEntity.history.priorIncidents}
                      </div>
                    </div>
                    <div className="bg-slate-800/50 p-2 rounded">
                      <div className="text-[10px] text-slate-500">Alcohol Today</div>
                      <div className={`font-bold ${selectedEntity.session.alcoholCount >= 4 ? 'text-amber-400' : 'text-slate-300'}`}>
                        {selectedEntity.session.alcoholCount} drinks
                      </div>
                    </div>
                  </div>

                  {/* Watchlist status */}
                  <div className="flex items-center justify-between mb-3 text-[11px]">
                    <span className="text-slate-400">Watchlist Status:</span>
                    <span className={
                      selectedEntity.history.watchlistStatus === 'high' ? 'text-red-400 font-bold' :
                      selectedEntity.history.watchlistStatus === 'low' ? 'text-amber-400' :
                      'text-slate-500'
                    }>
                      {selectedEntity.history.watchlistStatus.toUpperCase()}
                    </span>
                  </div>

                  {/* Threat factors */}
                  {selectedEntity.threatFactors.length > 0 && (
                    <div className="mb-3 p-2 bg-red-950/30 rounded border border-red-800/50">
                      <div className="text-[10px] text-red-400 font-bold mb-1">RISK FACTORS</div>
                      <ul className="text-[10px] text-red-300 space-y-0.5">
                        {selectedEntity.threatFactors.map((f, i) => (
                          <li key={i}>• {f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => toggleWatchlist(selectedEntity.id)}
                      className={`flex-1 py-1.5 rounded text-[11px] font-medium transition-colors ${
                        selectedEntity.session.isWatched
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {selectedEntity.session.isWatched ? '✓ Watching' : 'Add to Watchlist'}
                    </button>
                    <button
                      onClick={() => setSelectedEntity(null)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 text-[11px]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        </div>

        {/* === RIGHT: PREDICTIVE ENGINE === */}
        <div className="col-span-1 bg-slate-950 flex flex-col h-full">
          <div className="p-3 border-b border-slate-800 font-semibold text-xs text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" />
            <span>Predictive Engine</span>
          </div>

          {/* Model info */}
          <div className="p-3 bg-slate-900/50 border-b border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Active Model</div>
            <div className="text-sm font-mono text-cyan-400">GAME_DAY_v2.4</div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '94%' }} />
              </div>
              <span className="text-[10px] text-slate-400">94% conf</span>
            </div>
          </div>

          {/* High risk entities */}
          <div className="p-3 border-b border-slate-800">
            <div className="text-[10px] text-red-400 uppercase font-bold mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> High Risk Entities ({highRiskEntities.length})
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {highRiskEntities.slice(0, 5).map(e => (
                <div
                  key={e.id}
                  onClick={() => setSelectedEntity(e)}
                  className="p-2 bg-red-950/30 rounded border border-red-800/50 cursor-pointer hover:bg-red-950/50 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-xs">{e.name}</span>
                    <span className={`text-[10px] font-bold ${e.threatLevel === 'CRITICAL' ? 'text-red-400' : 'text-orange-400'}`}>
                      {e.threatScore}
                    </span>
                  </div>
                  <ThreatGauge score={e.threatScore} size="sm" />
                </div>
              ))}
              {highRiskEntities.length === 0 && (
                <div className="text-slate-500 text-xs text-center py-4">No high-risk entities</div>
              )}
            </div>
          </div>

          {/* Predictions */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-[10px] text-amber-400 uppercase font-bold mb-3 flex items-center justify-between">
              <span>Active Predictions ({predictions.length})</span>
            </div>
            <div className="space-y-3">
              {predictions.map((pred) => (
                <div
                  key={pred.id}
                  className={`p-3 rounded-lg border transition-all ${
                    pred.priority === 'CRITICAL' ? 'border-red-500/50 bg-red-950/30' :
                    pred.priority === 'HIGH' ? 'border-orange-500/40 bg-orange-950/20' :
                    pred.priority === 'MEDIUM' ? 'border-amber-500/30 bg-amber-950/20' :
                    'border-slate-600/30 bg-slate-800/20'
                  }`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Icon name={pred.icon} className={`w-4 h-4 ${
                        pred.priority === 'CRITICAL' ? 'text-red-400' :
                        pred.priority === 'HIGH' ? 'text-orange-400' :
                        'text-amber-400'
                      }`} />
                      <span className={`text-xs font-bold ${
                        pred.priority === 'CRITICAL' ? 'text-red-400' :
                        pred.priority === 'HIGH' ? 'text-orange-400' :
                        'text-amber-400'
                      }`}>
                        {pred.prediction.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        pred.priority === 'CRITICAL' ? 'bg-red-500/30 text-red-300' :
                        pred.priority === 'HIGH' ? 'bg-orange-500/30 text-orange-300' :
                        'bg-slate-600/30 text-slate-400'
                      }`}>
                        {pred.confidence}%
                      </span>
                    </div>
                  </div>

                  {/* Entity info - clickable */}
                  <div
                    onClick={() => handlePredictionClick(pred)}
                    className="flex items-center gap-2 p-2 bg-slate-900/50 rounded cursor-pointer hover:bg-slate-800/50 transition-colors mb-2"
                  >
                    <Target className="w-3 h-3 text-cyan-500" />
                    <span className="text-xs text-cyan-400 font-medium">{pred.entityName}</span>
                    <span className="text-[10px] text-slate-500 ml-auto">Click to view →</span>
                  </div>

                  {/* Suggested Action */}
                  <div className="p-2 bg-slate-900/30 rounded border-l-2 border-cyan-500/50">
                    <div className="text-[9px] text-slate-500 uppercase mb-1">Suggested Action</div>
                    <div className="text-[11px] text-cyan-300 font-medium">{pred.action}</div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-700/50">
                    <span className="text-[9px] text-slate-500">{pred.time}</span>
                    <button
                      onClick={() => dismissPrediction(pred.id)}
                      className="text-[10px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {predictions.length === 0 && (
              <div className="text-center py-8">
                <Brain className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <div className="text-slate-500 text-xs">Analyzing patterns...</div>
                <div className="text-slate-600 text-[10px] mt-1">Predictions will appear here</div>
              </div>
            )}
          </div>

          {/* Stats footer */}
          <div className="p-3 border-t border-slate-800 bg-slate-900/50">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-slate-200">{entities.length}</div>
                <div className="text-[10px] text-slate-500">Total Tracked</div>
              </div>
              <div>
                <div className="text-lg font-bold text-amber-400">{watchlistCount}</div>
                <div className="text-[10px] text-slate-500">On Watchlist</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
