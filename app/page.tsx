"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type LeaderboardEntry = {
  player: string;
  team: string;
  year: number;
  yards: number;
};

type LiveLeaderboardEntry = LeaderboardEntry & {
  originalIndex: number;
  isLive?: boolean;
  accent?: string;
  accentSecondary?: string;
};

type Player = {
  id: "jsn" | "puka";
  espnId: string;
  name: string;
  team: string;
  season: number;
  accent: string;
  accentSecondary: string;
  yards: number;
  games: number;
  liveGameYards?: number | null;
};

const SEASON_GAMES = 17;
const SEASON_WEEKS = 18;

const leaderboardData: LeaderboardEntry[] = [
  { player: "Calvin Johnson+", team: "DET", year: 2012, yards: 1964 },
  { player: "Cooper Kupp", team: "LAR", year: 2021, yards: 1947 },
  { player: "Julio Jones", team: "ATL", year: 2015, yards: 1871 },
  { player: "Jerry Rice+", team: "SFO", year: 1995, yards: 1848 },
  { player: "Antonio Brown", team: "PIT", year: 2015, yards: 1834 },
  { player: "Justin Jefferson", team: "MIN", year: 2022, yards: 1809 },
  { player: "Tyreek Hill", team: "MIA", year: 2023, yards: 1799 },
  { player: "Isaac Bruce+", team: "STL", year: 1995, yards: 1781 },
  { player: "CeeDee Lamb", team: "DAL", year: 2023, yards: 1749 },
  { player: "Charley Hennigan", team: "HOU", year: 1961, yards: 1746 },
  { player: "Michael Thomas", team: "NOR", year: 2019, yards: 1725 },
  { player: "Marvin Harrison+", team: "IND", year: 2002, yards: 1722 },
  { player: "Tyreek Hill", team: "MIA", year: 2022, yards: 1710 },
  { player: "Ja'Marr Chase", team: "CIN", year: 2024, yards: 1708 },
  { player: "Antonio Brown", team: "PIT", year: 2014, yards: 1698 },
  { player: "Torry Holt", team: "STL", year: 2003, yards: 1696 },
  { player: "Herman Moore", team: "DET", year: 1995, yards: 1686 },
  { player: "Calvin Johnson+", team: "DET", year: 2011, yards: 1681 },
  { player: "Julio Jones", team: "ATL", year: 2018, yards: 1677 },
  { player: "Marvin Harrison+", team: "IND", year: 1999, yards: 1663 },
  { player: "Josh Gordon", team: "CLE", year: 2013, yards: 1646 },
  { player: "Jaxon Smith-Njigba", team: "SEA", year: 2025, yards: 1637 },
  { player: "Jimmy Smith", team: "JAX", year: 1999, yards: 1636 },
  { player: "Torry Holt", team: "STL", year: 2000, yards: 1635 },
  { player: "Randy Moss+", team: "MIN", year: 2003, yards: 1632 },
  { player: "Demaryius Thomas", team: "DEN", year: 2014, yards: 1619 },
  { player: "Justin Jefferson", team: "MIN", year: 2021, yards: 1616 },
  { player: "Michael Irvin+", team: "DAL", year: 1995, yards: 1603 },
  { player: "Lance Alworth+", team: "SDG", year: 1965, yards: 1602 },
  { player: "Rod Smith", team: "DEN", year: 2000, yards: 1602 },
  { player: "David Boston", team: "ARI", year: 2001, yards: 1598 },
  { player: "Andre Johnson+", team: "HOU", year: 2012, yards: 1598 },
  { player: "Julio Jones", team: "ATL", year: 2014, yards: 1593 },
  { player: "Puka Nacua", team: "LAR", year: 2025, yards: 1592 },
];

const initialPlayers: Player[] = [
  {
    id: "jsn",
    espnId: "4430878",
    name: "Jaxon Smith-Njigba",
    team: "SEA",
    season: 2025,
    accent: "#046A38",
    accentSecondary: "#003087",
    yards: 0,
    games: 0,
  },
  {
    id: "puka",
    espnId: "4426515",
    name: "Puka Nacua",
    team: "LAR",
    season: 2025,
    accent: "#FFD100",
    accentSecondary: "#003594",
    yards: 0,
    games: 0,
  },
];

const LIVE_REFRESH_MS = 60000;
const LIVE_ATHLETE_IDS = initialPlayers
  .map((player) => player.espnId)
  .join(",");

type LivePlayerStats = {
  id: string;
  seasonYear: number | null;
  receivingYards: number | null;
  gamesPlayed: number | null;
  liveGameYards?: number | null;
  error?: string;
};

type LiveApiResponse = {
  seasonYear: number | null;
  currentWeek?: number | null;
  fetchedAt: string;
  players: LivePlayerStats[];
};

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

const formatDecimal = (value: number) => {
  if (!Number.isFinite(value) || value === 0) return "-";
  return value.toFixed(1);
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getRank = (value: number, leaderboard: LeaderboardEntry[]) => {
  if (!Number.isFinite(value) || value <= 0) return null;
  const spot = leaderboard.findIndex((entry) => value >= entry.yards);
  if (spot === -1) return leaderboard.length + 1;
  return spot + 1;
};

const yardsToTarget = (value: number, target: number) => {
  if (!Number.isFinite(value)) return "-";
  const delta = target - value;
  if (delta <= 0) return "Reached";
  return `${formatNumber(delta)} needed`;
};

const formatRate = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(1);
};

const perGameNeeded = (
  current: number,
  target: number,
  remainingGames: number | null
) => {
  if (remainingGames === null || !Number.isFinite(remainingGames)) return "-";
  if (remainingGames <= 0) return "No games left";
  const delta = target - current;
  if (delta <= 0) return "Reached";
  return `${formatRate(delta / remainingGames)} yds/gm`;
};

const PlayerCard = ({
  player,
  leaderboard,
  record,
  seasonWeek,
  weeksRemaining,
}: {
  player: Player;
  leaderboard: LeaderboardEntry[];
  record: LeaderboardEntry;
  seasonWeek: number | null;
  weeksRemaining: number | null;
}) => {
  const yards = player.yards;
  const games = player.games;
  const liveGameActive = (player.liveGameYards ?? 0) > 0;
  const averageGames = games + (liveGameActive ? 1 : 0);
  const perGame = averageGames > 0 ? yards / averageGames : 0;
  const pace = perGame * SEASON_GAMES;
  const currentRank = getRank(yards, leaderboard);
  const progress = clampNumber((yards / record.yards) * 100, 0, 100);
  const remainingGames =
    typeof weeksRemaining === "number"
      ? weeksRemaining
      : Math.max(SEASON_GAMES - games, 0);

  return (
    <section
      className="card player-row rise flex flex-col gap-5"
      style={{ borderTop: `4px solid ${player.accent}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className="badge"
          style={{
            background: `${player.accent}1f`,
            color: player.accent,
            borderColor: `${player.accent}55`,
          }}
        >
          {player.team} - {player.season} season
        </span>
        <span className="text-xs font-semibold text-[color:var(--muted)]">
          Live pace
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-2xl text-[color:var(--foreground)]">
          {player.name}
        </h3>
        <div className="flex items-baseline gap-2 text-[color:var(--foreground)]">
          <span className="font-display text-3xl">
            {formatNumber(player.yards)}
          </span>
          <span className="text-sm text-[color:var(--muted)]">rec yards</span>
        </div>
        <p className="text-sm text-[color:var(--muted)]">
          Live tracker with pace projections and record chase context.
        </p>
      </div>

      <div className="stat-pills">
        <span className="pill is-active">{player.team}</span>
        <span className="pill">Season {player.season}</span>
        <span className="pill">Week {seasonWeek ?? "-"}</span>
        <span className="pill">{player.games} GP</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="stat">
          <span className="block text-xs text-[color:var(--muted)]">
            Live Game Yards
          </span>
          <strong className="text-lg font-semibold">
            {Number.isFinite(player.liveGameYards)
              ? formatNumber(player.liveGameYards as number)
              : "-"}
          </strong>
        </div>
        <div className="stat">
          <span className="block text-xs text-[color:var(--muted)]">
            Season Week
          </span>
          <strong className="text-lg font-semibold">{seasonWeek ?? "-"}</strong>
        </div>
        <div className="stat">
          <span className="block text-xs text-[color:var(--muted)]">
            Games Left
          </span>
          <strong className="text-lg font-semibold">
            {Number.isFinite(remainingGames) ? remainingGames : "-"}
          </strong>
        </div>
        <div className="stat">
          <span className="block text-xs text-[color:var(--muted)]">
            Yards/Game
          </span>
          <strong className="text-lg font-semibold">
            {formatDecimal(perGame)}
          </strong>
          <span className="mt-1 block text-xs text-[color:var(--muted)]">
            based on {averageGames} games
            {liveGameActive ? " (incl. live)" : ""}
          </span>
        </div>
        <div className="stat">
          <span className="block text-xs text-[color:var(--muted)]">
            17-Game Pace
          </span>
          <strong className="text-lg font-semibold">
            {formatNumber(Math.round(pace))}
          </strong>
        </div>
        <div className="stat">
          <span className="block text-xs text-[color:var(--muted)]">
            Rank Now
          </span>
          <strong className="text-lg font-semibold">
            {currentRank ? `#${currentRank}` : "-"}
          </strong>
        </div>
      </div>

      <div className="space-y-3">
        <span className="text-xs font-semibold text-[color:var(--muted)]">
          Progress to all-time record
        </span>
        <div className="progress">
          <span
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${player.accent}, ${player.accentSecondary})`,
            }}
          />
        </div>
      </div>

      <div className="grid gap-2 text-sm text-[color:var(--muted)]">
        <div className="border border-[color:var(--divider)] border-l-4 border-l-[color:var(--sunset)] bg-[color:var(--card-strong)] p-3 font-semibold text-[color:var(--foreground)]">
          Record chase: {yardsToTarget(yards, record.yards)}
        </div>
        <div>
          <strong className="text-[color:var(--foreground)]">
            2,000 club:
          </strong>{" "}
          {yardsToTarget(yards, 2000)}
        </div>
        <div>
          <strong className="text-[color:var(--foreground)]">
            1,800 mark:
          </strong>{" "}
          {yardsToTarget(yards, 1800)}
        </div>
        <div className="pt-2 text-xs font-semibold text-[color:var(--muted)]">
          Needed per game (remaining)
        </div>
        <div className="record-pace">
          <span className="record-pace-label">Record pace:</span>
          <span className="record-pace-value">
            {perGameNeeded(yards, record.yards, remainingGames)}
          </span>
        </div>
      </div>
    </section>
  );
};

const Leaderboard = ({
  leaderboard,
  baselineRanks,
}: {
  leaderboard: LiveLeaderboardEntry[];
  baselineRanks: Map<string, number>;
}) => {
  const listRef = useRef<HTMLUListElement | null>(null);
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const nextPositions = new Map<string, DOMRect>();
    const items = Array.from(list.children) as HTMLElement[];

    items.forEach((item) => {
      const key = item.dataset.key;
      if (!key) return;
      const rect = item.getBoundingClientRect();
      nextPositions.set(key, rect);
      const prev = positionsRef.current.get(key);
      if (!prev) return;

      const deltaY = prev.top - rect.top;
      if (!deltaY) return;

      item.style.transform = `translateY(${deltaY}px)`;
      item.style.transition = "transform 0s";
      requestAnimationFrame(() => {
        item.style.transition = "transform 350ms ease";
        item.style.transform = "";
      });
    });

    positionsRef.current = nextPositions;
  }, [leaderboard]);

  let lastYards: number | null = null;
  let lastRank = 0;
  const ranked = leaderboard.map((entry, index) => {
    const rank = lastYards === entry.yards ? lastRank : index + 1;
    lastYards = entry.yards;
    lastRank = rank;
    return { ...entry, rank };
  });

  const rankDeltas = new Map<string, number>();
  ranked.forEach((entry) => {
    if (!entry.isLive) return;
    const entryKey = `${entry.player}-${entry.team}-${entry.year}`;
    const baselineRank = baselineRanks.get(entryKey);
    if (typeof baselineRank !== "number") return;
    const delta = baselineRank - entry.rank;
    if (delta > 0) {
      rankDeltas.set(entryKey, delta);
    }
  });

  const liveIndices = ranked
    .map((entry, index) => (entry.isLive ? index : -1))
    .filter((index) => index >= 0);
  const hasBothLive = liveIndices.length >= 2;
  const maxLiveIndex = liveIndices.length ? Math.max(...liveIndices) : 9;
  const showCount =
    hasBothLive && liveIndices.every((index) => index < 10)
      ? 10
      : maxLiveIndex + 1;
  const visible = ranked.slice(0, showCount);

  return (
    <section className="card rise flex flex-col gap-4">
      <div>
        <h3 className="font-display text-2xl font-semibold">
          All-Time Single-Season Receiving Yards
        </h3>
        <p className="text-sm text-[color:var(--muted)]">
          Live rows climb in real time. List stops at JSN/Puka.
        </p>
      </div>
      <ul className="leaderboard-list" ref={listRef}>
        {visible.map((entry) => {
          const entryKey = `${entry.player}-${entry.team}-${entry.year}`;
          const rankDelta = rankDeltas.get(entryKey);
          const accent = entry.accent ?? "var(--accent-strong)";
          const accentSecondary = entry.accentSecondary ?? "var(--accent)";
          const liveStyle: CSSProperties | undefined = entry.isLive
            ? {
                borderColor: accent,
                boxShadow: `0 0 0 1px ${accent}55`,
                background: `linear-gradient(135deg, ${accent}1f, ${accentSecondary}08)`,
              }
            : undefined;
          return (
            <li
              key={entryKey}
              data-key={entryKey}
              className={`leaderboard-item flex flex-wrap items-center justify-between gap-2 border border-[color:var(--divider)] bg-[color:var(--card-strong)] px-4 py-3${
                entry.isLive ? " is-live" : ""
              }`}
              style={liveStyle}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`font-display text-sm ${
                    entry.isLive
                      ? "text-[color:var(--foreground)]"
                      : "text-[color:var(--accent-strong)]"
                  }`}
                >
                  #{entry.rank}
                </span>
                {rankDelta ? (
                  <span className="rank-delta">
                    <span className="rank-delta-icon" aria-hidden="true" />
                    {rankDelta}
                  </span>
                ) : null}
              </div>
              <div className="flex-1 text-sm">
                <strong>{entry.player}</strong> - {entry.team} - {entry.year}
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>{formatNumber(entry.yards)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const Comparison = ({
  players,
  record,
}: {
  players: Player[];
  record: LeaderboardEntry;
}) => {
  const [jsn, puka] = players;
  const yardDiff = puka.yards - jsn.yards;
  const paceJsn = jsn.games > 0 ? (jsn.yards / jsn.games) * SEASON_GAMES : 0;
  const pacePuka =
    puka.games > 0 ? (puka.yards / puka.games) * SEASON_GAMES : 0;
  const paceDiff = pacePuka - paceJsn;
  const leadPlayer = yardDiff === 0 ? null : yardDiff > 0 ? puka : jsn;
  const paceLeader = paceDiff === 0 ? null : paceDiff > 0 ? puka : jsn;
  const leadGap = Math.abs(yardDiff);
  const paceGap = Math.abs(Math.round(paceDiff));
  const leadProgress = clampNumber(
    (Math.max(jsn.yards, puka.yards) / record.yards) * 100,
    0,
    100
  );
  const playerLabel = (player: Player) =>
    player.id === "jsn" ? "JSN" : "Puka";

  return (
    <section className="card rise comparison-card flex flex-col gap-5">
      <div className="comparison-header">
        <div>
          <h3 className="font-display text-2xl font-semibold">
            Head-to-Head Pulse
          </h3>
          <p className="text-sm text-[color:var(--muted)]">
            Momentum tracker for the two live chasers.
          </p>
        </div>
        <div className="comparison-tag">
          <span className="status-dot" />
          Live chase
        </div>
      </div>

      <div className="comparison-banner">
        <div className="space-y-2">
          <span className="kicker">Current lead</span>
          <div className="comparison-lead">
            <span
              className="comparison-lead-name"
              style={{
                color: leadPlayer ? leadPlayer.accent : "var(--foreground)",
              }}
            >
              {leadPlayer ? playerLabel(leadPlayer) : "Even"}
            </span>
            <span className="comparison-lead-gap">
              {leadPlayer ? `+${formatNumber(leadGap)} yds` : "No gap"}
            </span>
          </div>
        </div>
        <div className="comparison-bar">
          <span
            style={{
              width: `${leadProgress}%`,
              background: leadPlayer
                ? `linear-gradient(90deg, ${leadPlayer.accent}, ${leadPlayer.accentSecondary})`
                : "linear-gradient(90deg, var(--accent), var(--accent-strong))",
            }}
          />
        </div>
        <div className="comparison-sub">
          Pace edge:{" "}
          <strong>
            {paceLeader
              ? `${playerLabel(paceLeader)} +${formatNumber(paceGap)}`
              : "Even"}
          </strong>
        </div>
      </div>

      <div className="comparison-metrics">
        <div className="metric-tile">
          <span className="metric-title">Yard gap</span>
          <span className="metric-value">
            {formatNumber(Math.abs(yardDiff))}
          </span>
          <span className="metric-sub">
            {yardDiff === 0
              ? "Even"
              : yardDiff > 0
              ? "Puka ahead"
              : "JSN ahead"}
          </span>
        </div>
        <div className="metric-tile">
          <span className="metric-title">Pace gap</span>
          <span className="metric-value">
            {formatNumber(Math.abs(Math.round(paceDiff)))}
          </span>
          <span className="metric-sub">
            {paceDiff === 0
              ? "Even"
              : paceDiff > 0
              ? "Puka ahead"
              : "JSN ahead"}
          </span>
        </div>
        <div className="metric-tile">
          <span className="metric-title">Record watch</span>
          <span className="metric-value">{formatNumber(record.yards)}</span>
          <span className="metric-sub">
            {record.player} ({record.year})
          </span>
        </div>
      </div>
    </section>
  );
};

export default function Home() {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [liveSeason, setLiveSeason] = useState<number | null>(null);
  const [liveWeek, setLiveWeek] = useState<number | null>(null);
  const leaderboard = useMemo(() => {
    const liveByName = new Map(players.map((player) => [player.name, player]));
    return leaderboardData
      .map((entry, index) => {
        const livePlayer = liveByName.get(entry.player);
        if (!livePlayer) {
          return {
            ...entry,
            originalIndex: index,
          } as LiveLeaderboardEntry;
        }

        return {
          ...entry,
          year: livePlayer.season,
          yards: livePlayer.yards,
          isLive: true,
          accent: livePlayer.accent,
          accentSecondary: livePlayer.accentSecondary,
          originalIndex: index,
        } as LiveLeaderboardEntry;
      })
      .sort((a, b) => b.yards - a.yards || a.originalIndex - b.originalIndex);
  }, [players]);
  const baselineRanks = useMemo(() => {
    const liveByName = new Map(players.map((player) => [player.name, player]));
    const baseline = leaderboardData
      .map((entry, index) => {
        const livePlayer = liveByName.get(entry.player);
        if (!livePlayer) {
          return {
            ...entry,
            originalIndex: index,
          } as LiveLeaderboardEntry;
        }

        const liveGameYards = livePlayer.liveGameYards ?? 0;
        const baseYards = Math.max(livePlayer.yards - liveGameYards, 0);
        return {
          ...entry,
          year: livePlayer.season,
          yards: baseYards,
          isLive: true,
          originalIndex: index,
        } as LiveLeaderboardEntry;
      })
      .sort((a, b) => b.yards - a.yards || a.originalIndex - b.originalIndex);

    let lastYards: number | null = null;
    let lastRank = 0;
    const ranks = new Map<string, number>();
    baseline.forEach((entry, index) => {
      const rank = lastYards === entry.yards ? lastRank : index + 1;
      lastYards = entry.yards;
      lastRank = rank;
      const key = `${entry.player}-${entry.team}-${entry.year}`;
      ranks.set(key, rank);
    });

    return ranks;
  }, [players]);
  const record = leaderboard[0];
  const weeksRemaining =
    typeof liveWeek === "number"
      ? Math.max(SEASON_WEEKS - liveWeek + 1, 0)
      : null;

  const fetchLiveStats = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);

    try {
      const teamParam = players.map((player) => player.team).join(",");
      const response = await fetch(
        `/api/espn?ids=${LIVE_ATHLETE_IDS}&teams=${teamParam}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(`Live fetch failed (${response.status})`);
      }

      const data = (await response.json()) as LiveApiResponse;
      const liveById = new Map(
        data.players.map((player) => [player.id, player])
      );

      setPlayers((current) =>
        current.map((player) => {
          const live = liveById.get(player.espnId);
          if (!live || live.error) return player;

          const baseYards =
            typeof live.receivingYards === "number"
              ? Math.round(live.receivingYards)
              : player.yards;
          const liveGameYards =
            typeof live.liveGameYards === "number" ? live.liveGameYards : 0;
          const totalYards =
            liveGameYards > 0 ? baseYards + liveGameYards : baseYards;

          return {
            ...player,
            season:
              typeof live.seasonYear === "number"
                ? live.seasonYear
                : player.season,
            yards: totalYards,
            games:
              typeof live.gamesPlayed === "number"
                ? Math.round(live.gamesPlayed)
                : player.games,
            liveGameYards: liveGameYards > 0 ? liveGameYards : null,
          };
        })
      );

      const errors = data.players
        .filter((player) => player.error)
        .map((player) => `${player.id}: ${player.error}`)
        .join(" | ");

      setLiveError(errors || null);
      setLiveSeason(
        typeof data.seasonYear === "number" ? data.seasonYear : null
      );
      setLiveWeek(
        typeof data.currentWeek === "number" ? data.currentWeek : null
      );
      setLiveUpdatedAt(
        data.fetchedAt
          ? new Date(data.fetchedAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })
          : null
      );
    } catch (error) {
      setLiveError(
        error instanceof Error ? error.message : "Live fetch failed"
      );
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!liveEnabled) return;
    let active = true;

    const run = async () => {
      if (!active) return;
      await fetchLiveStats();
    };

    run();
    const interval = window.setInterval(run, LIVE_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [fetchLiveStats, liveEnabled]);

  return (
    <div className="relative min-h-screen">
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">
              JSN and Puka Tracker 
            </h1>
            <p className="max-w-xl text-base text-[color:var(--muted)] md:text-lg">
              Track every yard, pace the projections, and see exactly where each
              season would land on the single-season receiving leaderboard.
            </p>
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-[color:var(--muted)]">
              <span className="badge">17-game pace</span>
              <span className="badge">Live rankings</span>
              <span className="badge">Record chase</span>
            </div>
          </div>
          <div className="record-card rise flex flex-col justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[color:var(--muted)]">
                All-Time Record
              </p>
              <div className="font-display text-4xl font-semibold">
                {formatNumber(record.yards)} yards
              </div>
            </div>
            <div className="text-sm text-[color:var(--muted)]">
              {record.player} - {record.team} - {record.year}
            </div>
          </div>
        </header>

        <section className="card rise flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--muted)]">
              <span
                className={`status-dot${liveEnabled ? "" : " is-offline"}`}
              />
              {liveEnabled ? "Live feed" : "Live paused"}
            </div>
            <div className="text-sm text-[color:var(--muted)]">
              ESPN regular season stats
              {liveSeason ? ` - ${liveSeason}` : ""}
              {typeof liveWeek === "number" ? ` - Week ${liveWeek}` : ""}
              {typeof weeksRemaining === "number"
                ? ` - ${weeksRemaining} left`
                : ""}
              {liveUpdatedAt ? ` - Updated ${liveUpdatedAt}` : ""}
            </div>
            {liveError ? (
              <div className="text-xs text-[color:var(--warning)]">
                {liveError}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="control-button primary"
              type="button"
              onClick={fetchLiveStats}
              disabled={liveLoading}
            >
              {liveLoading ? "Refreshing" : "Refresh now"}
            </button>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          {players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              leaderboard={leaderboard}
              record={record}
              seasonWeek={liveWeek}
              weeksRemaining={weeksRemaining}
            />
          ))}
        </section>

        <section className="grid gap-5">
          <Comparison players={players} record={record} />
        </section>

        <section className="grid gap-5">
          <Leaderboard leaderboard={leaderboard} baselineRanks={baselineRanks} />
        </section>

        <p className="text-xs text-[color:var(--muted)]">
          Tip: update the <code>leaderboardData</code> list in
          <code>app/page.tsx</code> to extend the leaderboard.
        </p>
      </main>
    </div>
  );
}
