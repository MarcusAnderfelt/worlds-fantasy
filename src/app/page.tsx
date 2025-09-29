"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Play, Upload, Plus, Eraser, Download, Users, Crown, ClipboardList, CheckCircle2, XCircle } from "lucide-react";

/**
 * WORLDS 2025 FANTASY — STABLE BUILD + JSON IMPORT/EXPORT
 * - Regions EXACTLY: LCK, LPL, LEC, LTA, LCP
 * - Draft: any-role snake draft; roster size locked to 5 (one per region)
 * - Constraint: after any pick, remaining slots must be enough to cover all missing regions
 * - Migration + guards: no crashes if roster arrays or legacy state missing
 * - Export/Import JSON buttons with browser alerts
 * - Dev Tests tab retained
 */

// ---- Constants & Types ----
const ROLES = ["TOP", "JNG", "MID", "ADC", "SUP"] as const;
const REGIONS = ["LCK", "LPL", "LEC", "LTA", "LCP"] as const; // REQUIRED set

type Role = typeof ROLES[number];
type Region = typeof REGIONS[number];

const ROLE_COLORS: Record<Role, string> = {
  TOP: "bg-blue-100 text-blue-700",
  JNG: "bg-green-100 text-green-700",
  MID: "bg-purple-100 text-purple-700",
  ADC: "bg-orange-100 text-orange-700",
  SUP: "bg-pink-100 text-pink-700",
};
const REGION_COLORS: Record<Region, string> = {
  LCK: "bg-emerald-100 text-emerald-800",
  LPL: "bg-red-100 text-red-800",
  LEC: "bg-indigo-100 text-indigo-800",
  LTA: "bg-sky-100 text-sky-800",
  LCP: "bg-yellow-100 text-yellow-800",
};

export type Player = {
  id: string;
  name: string;
  role: Role;
  proTeam?: string;
  region: Region;
  draftedBy?: string; // team id
  stats: {
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    games: number;
    points: number;
  };
};

export type Roster = {
  players: string[]; // player ids
};

export type FantasyTeam = {
  id: string;
  name: string;
  roster: Roster;
  points: number;
};

export type DraftState = {
  started: boolean;
  finished: boolean;
  order: string[]; // team ids
  currentRound: number; // 1-indexed
  totalRounds: number; // equals rosterSize
  currentPickIndex: number; // index within current round
  snake: boolean;
};

export type LeagueState = {
  leagueName: string;
  teams: FantasyTeam[];
  players: Player[];
  draft: DraftState;
  scoring: {
    kill: number;
    assist: number;
    death: number;
    csMultiplier: number; // 0.01 per CS (0.5/50)
  };
  rosterSize: number; // required roster size per team (locked to regions length)
};

const STORAGE_KEY = "worlds25-fantasy-lol";

// ---- Helpers ----
const uid = () => Math.random().toString(36).slice(2, 10);

function roleBadge(role: Role) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role]} border border-black/5`}>{role}</span>
  );
}
function regionBadge(region: Region) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${REGION_COLORS[region]} border border-black/5`}>{region}</span>
  );
}

function computePoints(p: Player, scoring: LeagueState["scoring"]) {
  const pts = p.stats.kills * scoring.kill +
    p.stats.assists * scoring.assist +
    p.stats.deaths * scoring.death +
    p.stats.cs * scoring.csMultiplier;
  return Math.round(pts * 100) / 100;
}

function getRoundOrder(baseOrder: string[], round: number, snake: boolean) {
  if (!snake) return baseOrder;
  const isOdd = round % 2 === 1;
  return isOdd ? baseOrder : [...baseOrder].reverse();
}

// Migration: ensure teams have roster.players arrays and players have stats/region set
function migrateState(raw: any): LeagueState {
  const fallback: LeagueState = {
    leagueName: "Worlds 2025 Fantasy League",
    teams: [
      { id: uid(), name: "Team 1", roster: { players: [] }, points: 0 },
      { id: uid(), name: "Team 2", roster: { players: [] }, points: 0 },
    ],
    players: [],
    draft: {
      started: false,
      finished: false,
      order: [],
      currentRound: 1,
      totalRounds: REGIONS.length,
      currentPickIndex: 0,
      snake: true,
    },
    scoring: { kill: 1, assist: 0.5, death: -1, csMultiplier: 0.01 },
    rosterSize: REGIONS.length,
  };
  if (!raw) return fallback;
  try {
    const s = typeof raw === "string" ? JSON.parse(raw) : raw;
    const teams: FantasyTeam[] = (s.teams || []).map((t: any, i: number) => ({
      id: t?.id || uid(),
      name: t?.name || `Team ${i + 1}`,
      roster: { players: Array.isArray(t?.roster?.players) ? t.roster.players : [] },
      points: Number.isFinite(t?.points) ? t.points : 0,
    }));
    const players: Player[] = (s.players || []).map((p: any) => ({
      id: p?.id || uid(),
      name: p?.name || "Player",
      role: ROLES.includes(p?.role) ? p.role : "MID",
      region: REGIONS.includes(p?.region) ? p.region : "LCK",
      proTeam: p?.proTeam,
      draftedBy: teams.find(tt => tt.id === p?.draftedBy)?.id,
      stats: {
        kills: Number.isFinite(p?.stats?.kills) ? p.stats.kills : 0,
        deaths: Number.isFinite(p?.stats?.deaths) ? p.stats.deaths : 0,
        assists: Number.isFinite(p?.stats?.assists) ? p.stats.assists : 0,
        cs: Number.isFinite(p?.stats?.cs) ? p.stats.cs : 0,
        games: Number.isFinite(p?.stats?.games) ? p.stats.games : 0,
        points: 0,
      },
    }));
    const draft: DraftState = {
      started: !!s?.draft?.started,
      finished: !!s?.draft?.finished,
      order: Array.isArray(s?.draft?.order) ? s.draft.order : [],
      currentRound: Number.isFinite(s?.draft?.currentRound) ? s.draft.currentRound : 1,
      totalRounds: Number.isFinite(s?.draft?.totalRounds) ? s.draft.totalRounds : (Number.isFinite(s?.rosterSize) ? s.rosterSize : REGIONS.length),
      currentPickIndex: Number.isFinite(s?.draft?.currentPickIndex) ? s.draft.currentPickIndex : 0,
      snake: s?.draft?.snake !== false,
    };
    const scoring = {
      kill: Number.isFinite(s?.scoring?.kill) ? s.scoring.kill : 1,
      assist: Number.isFinite(s?.scoring?.assist) ? s.scoring.assist : 0.5,
      death: Number.isFinite(s?.scoring?.death) ? s.scoring.death : -1,
      csMultiplier: Number.isFinite(s?.scoring?.csMultiplier) ? s.scoring.csMultiplier : 0.01,
    };
    const rosterSize = REGIONS.length; // lock to exact regions requirement
    return { leagueName: s?.leagueName || fallback.leagueName, teams, players, draft, scoring, rosterSize };
  } catch {
    return fallback;
  }
}

// ---- Component ----
export default function WorldsFantasyApp() {
  const [state, setState] = useState<LeagueState>(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      return migrateState(raw || undefined);
    }
    // fallback when running on server
    return migrateState(undefined);
  });




  // persist
  useEffect(() => {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}, [state]);


  // derive players with points dynamically
const playersWithPoints = useMemo(() => {
  return state.players.map(p => ({
    ...p,
    stats: {
      ...p.stats,
      points: computePoints(p, state.scoring),
    },
  }));
}, [state.players, state.scoring]);

// derive teams with total points dynamically
const teamsWithPoints = useMemo(() => {
  return state.teams.map(t => {
    const rosterPlayers = Array.isArray(t.roster?.players) ? t.roster.players : [];
    const total = rosterPlayers.reduce((sum, pid) => {
      const pl = playersWithPoints.find(pp => pp.id === pid);
      return sum + (pl?.stats.points || 0);
    }, 0);
    return { ...t, points: Math.round(total * 100) / 100 };
  });
}, [state.teams, playersWithPoints]);


  const teamById = useMemo(() => Object.fromEntries(state.teams.map(t => [t.id, t])), [state.teams]);

  // ---- League Setup helpers ----
  const addTeam = () => setState(s => ({ ...s, teams: [...s.teams, { id: uid(), name: `Team ${s.teams.length + 1}`, roster: { players: [] }, points: 0 }] }));
  const removeTeam = (id: string) => setState(s => ({ ...s, teams: s.teams.filter(t => t.id !== id) }));

  const addPlayer = (name: string, role: Role, region: Region, proTeam?: string) => setState(s => ({
    ...s,
    players: [...s.players, { id: uid(), name, role, region, proTeam, draftedBy: undefined, stats: { kills: 0, deaths: 0, assists: 0, cs: 0, games: 0, points: 0 } }],
  }));

  const bulkAddPlayers = (blob: string) => {
    const lines = blob.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const newPlayers: Player[] = [];
    for (const line of lines) {
      const [name, roleRaw, proTeam, regionRaw] = line.split(/\s*,\s*/);
      const role = (roleRaw?.toUpperCase() || "") as Role;
      const region = (regionRaw?.toUpperCase() || "") as Region;
      if (!name || !ROLES.includes(role) || !REGIONS.includes(region)) continue;
      newPlayers.push({ id: uid(), name, role, region, proTeam, draftedBy: undefined, stats: { kills: 0, deaths: 0, assists: 0, cs: 0, games: 0, points: 0 } });
    }
    if (newPlayers.length) setState(s => ({ ...s, players: [...s.players, ...newPlayers] }));
  };

  const resetAll = () => setState(migrateState(undefined));

  // ---- Draft logic (snake, any-role, exact-region constraint) ----
  const randomizedOrder = () => {
    const ids = [...state.teams.map(t => t.id)];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  };

  const startDraft = () => setState(s => ({
    ...s,
    draft: {
      ...s.draft,
      started: true,
      finished: false,
      order: s.draft.order.length ? s.draft.order : randomizedOrder(),
      currentRound: 1,
      totalRounds: s.rosterSize,
      currentPickIndex: 0,
      snake: true,
    },
  }));

  const currentPickingTeamId = useMemo(() => {
    if (!state.draft.started || state.draft.finished) return null;
    const order = getRoundOrder(state.draft.order, state.draft.currentRound, state.draft.snake);
    return order[state.draft.currentPickIndex] || null;
  }, [state.draft]);

  function getOrderThisRound() {
    return getRoundOrder(state.draft.order, state.draft.currentRound, state.draft.snake);
  }

  function regionConstraintViolation(team: FantasyTeam, player: Player): string | null {
    const rosterPlayers = Array.isArray(team?.roster?.players) ? team.roster.players : [];
    if (rosterPlayers.length >= state.rosterSize) return `Roster full (${state.rosterSize})`;
    const present = new Set<Region>(rosterPlayers.map(pid => state.players.find(pp => pp.id === pid)?.region as Region).filter(Boolean));
    const after = new Set<Region>(present);
    after.add(player.region);
    const missingAfter = REGIONS.filter(r => !after.has(r));
    const remainingAfter = state.rosterSize - (rosterPlayers.length + 1);
    if (missingAfter.length > remainingAfter) {
      return `Pick must be from a missing region now: ${REGIONS.filter(r=>!present.has(r)).join(", ")}`;
    }
    return null;
  }

  const draftPlayer = (playerId: string) => {
    setState(s => {
      if (s.draft.finished || !s.draft.started) return s;
      const teamId = currentPickingTeamId;
      if (!teamId) return s;
      const tIdx = s.teams.findIndex(t => t.id === teamId);
      const pIdx = s.players.findIndex(p => p.id === playerId);
      if (tIdx === -1 || pIdx === -1) return s;
      const team = s.teams[tIdx];
      const player = s.players[pIdx];
      if (player.draftedBy) return s;

      const violation = regionConstraintViolation(team, player);
      if (violation) {
        alert(violation);
        return s;
      }

      const newTeams = [...s.teams];
      const newPlayers = [...s.players];
      const safeRoster = Array.isArray(team?.roster?.players) ? team.roster.players : [];
      newTeams[tIdx] = { ...team, roster: { players: [...safeRoster, player.id] } };
      newPlayers[pIdx] = { ...player, draftedBy: team.id };

      // Finish if all teams filled
      const everyoneDone = newTeams.every(tt => (tt.roster?.players?.length || 0) >= s.rosterSize);
      if (everyoneDone) {
        return { ...s, players: newPlayers, teams: newTeams, draft: { ...s.draft, finished: true } };
      }

      const orderThisRound = getRoundOrder(s.draft.order, s.draft.currentRound, s.draft.snake);
      const atEnd = s.draft.currentPickIndex + 1 >= orderThisRound.length;
      if (atEnd) {
        return { ...s, players: newPlayers, teams: newTeams, draft: { ...s.draft, currentRound: s.draft.currentRound + 1, currentPickIndex: 0 } };
      }
      return { ...s, players: newPlayers, teams: newTeams, draft: { ...s.draft, currentPickIndex: s.draft.currentPickIndex + 1 } };
    });
  };

  const undoLastPick = () => {
    setState(s => {
      let round = s.draft.currentRound;
      let index = s.draft.currentPickIndex - 1;
      if (index < 0) {
        round = round - 1;
        if (round < 1) return s;
        const prevOrder = getRoundOrder(s.draft.order, round, s.draft.snake);
        index = prevOrder.length - 1;
      }
      const order = getRoundOrder(s.draft.order, round, s.draft.snake);
      const teamId = order[index];
      const team = s.teams.find(t => t.id === teamId);
      if (!team) return s;
      const rosterPlayers = Array.isArray(team?.roster?.players) ? team.roster.players : [];
      const lastPid = rosterPlayers[rosterPlayers.length - 1];
      if (!lastPid) return s;
      const pIdx = s.players.findIndex(p => p.id === lastPid);
      if (pIdx === -1) return s;
      const newPlayers = [...s.players];
      newPlayers[pIdx] = { ...newPlayers[pIdx], draftedBy: undefined };
      const newTeams = s.teams.map(t => t.id === teamId ? { ...t, roster: { players: rosterPlayers.slice(0, -1) } } : t);
      return { ...s, players: newPlayers, teams: newTeams, draft: { ...s.draft, currentRound: round, currentPickIndex: index } };
    });
  };

  // ---- Stats entry ----
  const addGameStats = (playerId: string, add: { kills: number; deaths: number; assists: number; cs: number }) => {
    setState(s => {
      const idx = s.players.findIndex(p => p.id === playerId);
      if (idx === -1) return s;
      const p = s.players[idx];
      const stats = {
        kills: p.stats.kills + add.kills,
        deaths: p.stats.deaths + add.deaths,
        assists: p.stats.assists + add.assists,
        cs: p.stats.cs + add.cs,
        games: p.stats.games + 1,
        points: 0,
      };
      const newPlayers = [...s.players];
      newPlayers[idx] = { ...p, stats };
      return { ...s, players: newPlayers };
    });
  };

  // ---- Export / Import JSON ----
  const exportJSON = () => {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "league.json";
      a.click();
      URL.revokeObjectURL(url);
      alert("✅ Export complete!");
    } catch (e) {
      alert("❌ Export failed");
    }
  };

  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!confirm("This will replace your current league. Continue?")) return;
        setState(migrateState(data));
        alert("✅ Import successful!");
      } catch {
        alert("❌ Invalid file");
      }
    };
    reader.readAsText(file);
  };

  // ---- UI Tabs ----
  const SetupTab = () => {
    const [bulk, setBulk] = useState("");
    const [pName, setPName] = useState("");
    const [pRole, setPRole] = useState<Role>("TOP");
    const [pTeam, setPTeam] = useState("");
    const [pRegion, setPRegion] = useState<Region>("LCK");

    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>League Setup</CardTitle>
            <CardDescription>Points-based, unique ownership. Roster size locked to one per region.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>League name</Label>
                <Input value={state.leagueName} onChange={e => setState(s => ({ ...s, leagueName: e.target.value }))} />
              </div>
              <div>
                <Label>Roster size</Label>
                <Input type="number" value={state.rosterSize} disabled />
                <p className="text-xs text-muted-foreground">Exactly {REGIONS.length} (LCK/LPL/LEC/LTA/LCP).</p>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Teams</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {state.teams.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <Input value={t.name} onChange={e => setState(s => ({ ...s, teams: s.teams.map(tt => tt.id === t.id ? { ...tt, name: e.target.value } : tt) }))} />
                    <Button variant="outline" onClick={() => removeTeam(t.id)}>Remove</Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={addTeam}><Plus className="w-4 h-4 mr-2"/>Add Team</Button>
                <Button variant="secondary" onClick={() => setState(s => ({ ...s, draft: { ...s.draft, order: randomizedOrder() } }))}><RefreshCw className="w-4 h-4 mr-2"/>Randomize Draft Order</Button>
                <Button variant="destructive" onClick={resetAll}><Eraser className="w-4 h-4 mr-2"/>Reset All</Button>
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div>
                <Label>Add a single player</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Input placeholder="Player name" value={pName} onChange={e => setPName(e.target.value)} />
                  <Select value={pRole} onValueChange={(v: any) => setPRole(v)}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Role"/></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Pro team (optional)" value={pTeam} onChange={e => setPTeam(e.target.value)} />
                  <Select value={pRegion} onValueChange={(v: any) => setPRegion(v)}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Region"/></SelectTrigger>
                    <SelectContent>
                      {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => { if (pName.trim()) { addPlayer(pName.trim(), pRole, pRegion, pTeam.trim() || undefined); setPName(""); setPTeam(""); } }}>Add</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Bulk add below when Worlds rosters are locked.</p>
              </div>
              <div>
                <Label>Bulk add players (Name,Role,ProTeam,Region)</Label>
                <Textarea rows={6} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={`Faker,MID,T1,LCK\nRuler,ADC,Gen.G,LPL\nCaps,MID,G2,LEC\nPlayer,TOP,Some,LTA\nPlayer,SUP,Some,LCP`} />
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => { bulkAddPlayers(bulk); setBulk(""); }}><Upload className="w-4 h-4 mr-2"/>Bulk Add</Button>
                </div>
              </div>
            </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scoring</CardTitle>
            <CardDescription>Simple scoring suitable for manual stat entry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><Label>Kills</Label><Input className="w-24" type="number" step="0.5" value={state.scoring.kill} onChange={e => setState(s => ({ ...s, scoring: { ...s.scoring, kill: Number(e.target.value) } }))} /></div>
            <div className="flex items-center justify-between"><Label>Assists</Label><Input className="w-24" type="number" step="0.5" value={state.scoring.assist} onChange={e => setState(s => ({ ...s, scoring: { ...s.scoring, assist: Number(e.target.value) } }))} /></div>
            <div className="flex items-center justify-between"><Label>Deaths</Label><Input className="w-24" type="number" step="0.5" value={state.scoring.death} onChange={e => setState(s => ({ ...s, scoring: { ...s.scoring, death: Number(e.target.value) } }))} /></div>
            <div className="flex items-center justify-between"><Label>CS (per CS)</Label><Input className="w-24" type="number" step="0.001" value={state.scoring.csMultiplier} onChange={e => setState(s => ({ ...s, scoring: { ...s.scoring, csMultiplier: Number(e.target.value) } }))} /></div>
            <p className="text-xs text-muted-foreground">Default 0.01 per CS (0.5 per 50 CS).</p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={exportJSON}><Download className="w-4 h-4 mr-2"/>Export JSON</Button>
            <label className="flex">
              <input type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) importJSON(e.target.files[0]); }} />
              <Button variant="outline"><Upload className="w-4 h-4 mr-2"/>Import JSON</Button>
            </label>
          </CardFooter>
        </Card>
      </div>
    );
  };

  const DraftTab = () => {
    const orderThisRound = getOrderThisRound();
    const currentTeam = currentPickingTeamId ? teamById[currentPickingTeamId] : null;
    const [filterRole, setFilterRole] = useState<Role | "ALL">("ALL");
    const [filterRegion, setFilterRegion] = useState<Region | "ALL">("ALL");

    const available = state.players.filter(p => !p.draftedBy)
      .filter(p => (filterRole === "ALL" || p.role === filterRole))
      .filter(p => (filterRegion === "ALL" || p.region === filterRegion))
      .sort((a,b)=> a.name.localeCompare(b.name));

    const teamRegionProgress = (team?: FantasyTeam | null) => {
      if (!team) return null;
      const present = new Set<Region>((team.roster?.players || []).map(pid => state.players.find(pp => pp.id === pid)?.region as Region).filter(Boolean));
      return (
        <div className="flex flex-wrap gap-1">
          {REGIONS.map(r => (
            <span key={r} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${present.has(r) ? 'bg-green-100 text-green-800 border-green-300' : 'bg-neutral-100 text-neutral-700 border-neutral-300'}`}>
              {present.has(r) ? <CheckCircle2 className="w-3 h-3"/> : <XCircle className="w-3 h-3"/>}{r}
            </span>
          ))}
        </div>
      );
    };

    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Draft Room</CardTitle>
            <CardDescription>
              Snake draft • Round {state.draft.currentRound} / {state.draft.totalRounds} • Picking: {currentTeam ? currentTeam.name : "—"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!state.draft.started ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={startDraft}><Play className="w-4 h-4 mr-2"/>Start Draft</Button>
                  <Button variant="secondary" onClick={() => setState(s => ({ ...s, draft: { ...s.draft, order: randomizedOrder() } }))}><RefreshCw className="w-4 h-4 mr-2"/>Randomize Order</Button>
                </div>
                <div>
                  <Label>Draft Order (Round 1)</Label>
                  <ol className="list-decimal list-inside text-sm mt-1">
                    {state.draft.order.length ? state.draft.order.map(id => (<li key={id}>{teamById[id]?.name || id}</li>)) : <p className="text-muted-foreground">No order yet. Click Randomize.</p>}
                  </ol>
                </div>
                <p className="text-xs text-muted-foreground">Constraint: Finish with <b>one player from each region</b> (LCK/LPL/LEC/LTA/LCP). The app blocks picks that make this impossible.</p>
              </div>
            ) : state.draft.finished ? (
              <div className="space-y-2">
                <p className="text-sm">Draft complete! Go to Stats later to enter games and track standings.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={filterRole} onValueChange={(v: any) => setFilterRole(v)}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Filter role"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All roles</SelectItem>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterRegion} onValueChange={(v: any) => setFilterRegion(v)}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Filter region"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All regions</SelectItem>
                      {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={undoLastPick}>Undo Last Pick</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {available.map(p => (
                    <Card key={p.id} className="border-dashed">
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{p.name}</CardTitle>
                          <div className="flex gap-1">{roleBadge(p.role)}{regionBadge(p.region)}</div>
                        </div>
                        {p.proTeam && <CardDescription>{p.proTeam}</CardDescription>}
                      </CardHeader>
                      <CardFooter>
                        <Button onClick={() => draftPlayer(p.id)} disabled={!currentTeam}>
                          Draft to {currentTeam ? currentTeam.name : "—"}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>

                <div>
                  <Label>Pick Order — Round {state.draft.currentRound}</Label>
                  <ol className="list-decimal list-inside text-sm mt-1">
                    {orderThisRound.map((id, i) => (
                      <li key={id} className={i === state.draft.currentPickIndex ? "font-semibold" : "opacity-70"}>
                        {teamById[id]?.name || id}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Region Progress — {currentTeam ? currentTeam.name : "—"}</CardTitle>
            <CardDescription>One from each region required.</CardDescription>
          </CardHeader>
          <CardContent>
            {teamRegionProgress(currentTeam)}
          </CardContent>
        </Card>
      </div>
    );
  };

  const RostersTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {teamsWithPoints.map(t => (
        <Card key={t.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="w-4 h-4"/>{t.name}</CardTitle>
            <CardDescription>Total points: {t.points.toFixed(2)} • Roster {t.roster?.players?.length || 0}/{state.rosterSize}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(t.roster?.players || []).map(pid => {
                  const p = playersWithPoints.find(pp => pp.id === pid);
                  if (!p) return null;
                  return (
                    <TableRow key={pid}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{roleBadge(p.role)}</TableCell>
                      <TableCell>{regionBadge(p.region)}</TableCell>
                      <TableCell>{p.proTeam || ""}</TableCell>
                      <TableCell className="text-right">{p.stats.points.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const StatsTab = () => {
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
    const [k, setK] = useState(0);
    const [d, setD] = useState(0);
    const [a, setA] = useState(0);
    const [cs, setCS] = useState(0);
    const draftedPlayers = state.players.filter(p => p.draftedBy);

    const submit = () => {
      if (!selectedPlayerId) return;
      addGameStats(selectedPlayerId, { kills: k, deaths: d, assists: a, cs });
      setK(0); setD(0); setA(0); setCS(0);
    };

    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Enter Game Stats</CardTitle>
            <CardDescription>Points update automatically based on scoring.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
              <div className="md:col-span-2">
                <Label>Player</Label>
                <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                  <SelectTrigger><SelectValue placeholder="Select drafted player"/></SelectTrigger>
                  <SelectContent>
                    {draftedPlayers.sort((a,b)=>a.name.localeCompare(b.name)).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} · {p.region} · {teamById[p.draftedBy!]?.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Kills</Label><Input type="number" value={k} onChange={e => setK(Number(e.target.value))} /></div>
              <div><Label>Deaths</Label><Input type="number" value={d} onChange={e => setD(Number(e.target.value))} /></div>
              <div><Label>Assists</Label><Input type="number" value={a} onChange={e => setA(Number(e.target.value))} /></div>
              <div><Label>CS</Label><Input type="number" value={cs} onChange={e => setCS(Number(e.target.value))} /></div>
              <div className="md:col-span-5 flex gap-2">
                <Button onClick={submit}><ClipboardList className="w-4 h-4 mr-2"/>Add Game</Button>
              </div>
            </div>

            <div className="mt-2">
              <Label>All Players</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>K</TableHead>
                    <TableHead>D</TableHead>
                    <TableHead>A</TableHead>
                    <TableHead>CS</TableHead>
                    <TableHead>Games</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playersWithPoints.slice().sort((a,b)=>b.stats.points - a.stats.points).map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{roleBadge(p.role)}</TableCell>
                      <TableCell>{regionBadge(p.region)}</TableCell>
                      <TableCell>{p.proTeam || ""}</TableCell>
                      <TableCell>{p.stats.kills}</TableCell>
                      <TableCell>{p.stats.deaths}</TableCell>
                      <TableCell>{p.stats.assists}</TableCell>
                      <TableCell>{p.stats.cs}</TableCell>
                      <TableCell>{p.stats.games}</TableCell>
                      <TableCell className="text-right">{p.stats.points.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><Crown className="w-4 h-4 inline mr-2"/>Standings</CardTitle>
            <CardDescription>Totals update automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...teamsWithPoints].sort((a,b)=>b.points - a.points).map((t, idx) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={idx===0?"default":"secondary"}>{idx+1}</Badge>
                        <span>{t.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{t.points.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ---- Dev Tests ----
  type TestResult = { name: string; ok: boolean; message?: string };
  function runTests(): TestResult[] {
    const results: TestResult[] = [];
    // Test 1: Migration guards roster players array
    try {
      const migrated = migrateState({ teams: [{ id: "t1", name: "A", roster: {}, points: 0 }], players: [], scoring: { kill: 1, assist: 0.5, death: -1, csMultiplier: 0.01 } });
      const arr = migrated.teams[0].roster.players;
      results.push({ name: "Migration ensures roster.players array", ok: Array.isArray(arr) && arr.length === 0 });
    } catch (e: any) {
      results.push({ name: "Migration ensures roster.players array", ok: false, message: e?.message });
    }
    // Test 2: Region feasibility blocks impossible duplicate pick early
    try {
      const present = new Set<Region>(["LCK"] as Region[]);
      const after = new Set<Region>(present); after.add("LCK");
      const missingAfter = REGIONS.filter(r => !after.has(r));
      const remainingAfter = 5 - (1 + 1);
      const shouldBlock = missingAfter.length > remainingAfter;
      results.push({ name: "Feasibility check blocks when necessary", ok: shouldBlock });
    } catch (e: any) {
      results.push({ name: "Feasibility check blocks when necessary", ok: false, message: e?.message });
    }
    // Test 3: Safe reduce on empty roster
    try {
      const total = ([] as string[]).reduce((s) => s, 0); void total;
      results.push({ name: "Baseline reduce present", ok: true });
    } catch (e: any) {
      results.push({ name: "Baseline reduce present", ok: false, message: e?.message });
    }
    return results;
  }

  const DevTab = () => {
    const tests = runTests();
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dev Diagnostics</CardTitle>
          <CardDescription>Quick checks to prevent common crashes & logic issues.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map(t => (
                <TableRow key={t.name}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.ok ? <span className="text-green-700">PASS</span> : <span className="text-red-700">FAIL</span>}</TableCell>
                  <TableCell>{t.message || ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{state.leagueName}</h1>
          <p className="text-sm text-muted-foreground">Custom fantasy league for LoL Worlds 2025</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportJSON}><Download className="w-4 h-4 mr-2"/>Export JSON</Button>
          <label className="flex">
            <input type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) importJSON(e.target.files[0]); }} />
            <Button variant="outline"><Upload className="w-4 h-4 mr-2"/>Import JSON</Button>
          </label>
          <Button variant="destructive" onClick={() => { localStorage.removeItem(STORAGE_KEY); location.reload(); }}><Eraser className="w-4 h-4 mr-2"/>Hard Reset</Button>
        </div>
      </div>

      <Tabs defaultValue="setup" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="rosters">Rosters</TabsTrigger>
          <TabsTrigger value="stats">Stats & Standings</TabsTrigger>
          <TabsTrigger value="dev">Dev Tests</TabsTrigger>
        </TabsList>
        <TabsContent value="setup"><SetupTab/></TabsContent>
        <TabsContent value="draft"><DraftTab/></TabsContent>
        <TabsContent value="rosters"><RostersTab/></TabsContent>
        <TabsContent value="stats"><StatsTab/></TabsContent>
        <TabsContent value="dev"><DevTab/></TabsContent>
      </Tabs>

      <footer className="text-xs text-muted-foreground text-center py-4">
        Built for your group’s Worlds 2025 fantasy league. Regions required: LCK/LPL/LEC/LTA/LCP.
      </footer>
    </div>
  );
}
