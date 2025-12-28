import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type EspnStat = {
  name: string;
  value?: number;
};

type EspnCategory = {
  name: string;
  stats?: EspnStat[];
};

type EspnStatsResponse = {
  season?: {
    year?: number;
  };
  splits?: {
    categories?: EspnCategory[];
  };
};

type PlayerStats = {
  id: string;
  seasonYear: number | null;
  receivingYards: number | null;
  gamesPlayed: number | null;
  liveGameYards?: number | null;
  error?: string;
};

const LEAGUE_URL =
  "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl?lang=en&region=us";
const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

const getStatValue = (category: EspnCategory | undefined, statName: string) => {
  const stat = category?.stats?.find((item) => item.name === statName);
  return typeof stat?.value === "number" ? stat.value : null;
};

const getLeagueState = async () => {
  const response = await fetch(LEAGUE_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ESPN league fetch failed (${response.status})`);
  }
  const data = await response.json();
  const seasonYear =
    typeof data?.season?.year === "number" ? data.season.year : null;
  const currentWeek =
    typeof data?.season?.type?.week?.number === "number"
      ? data.season.type.week.number
      : null;
  return { seasonYear, currentWeek };
};

const fetchPlayerStats = async (
  athleteId: string,
  seasonYear: number | null,
  liveGameYards: Record<string, number>
): Promise<PlayerStats> => {
  if (!seasonYear) {
    return {
      id: athleteId,
      seasonYear: null,
      receivingYards: null,
      gamesPlayed: null,
      liveGameYards: liveGameYards[athleteId] ?? null,
      error: "Missing season year",
    };
  }

  const statsUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${seasonYear}/types/2/athletes/${athleteId}/statistics/0?lang=en&region=us`;
  const response = await fetch(statsUrl, { cache: "no-store" });

  if (!response.ok) {
    return {
      id: athleteId,
      seasonYear,
      receivingYards: null,
      gamesPlayed: null,
      liveGameYards: liveGameYards[athleteId] ?? null,
      error: `Stats fetch failed (${response.status})`,
    };
  }

  const data = (await response.json()) as EspnStatsResponse;
  const categories = data?.splits?.categories ?? [];
  const receiving = categories.find((category) => category.name === "receiving");
  const general = categories.find((category) => category.name === "general");

  return {
    id: athleteId,
    seasonYear: typeof data?.season?.year === "number" ? data.season.year : seasonYear,
    receivingYards: getStatValue(receiving, "receivingYards"),
    gamesPlayed: getStatValue(general, "gamesPlayed"),
    liveGameYards: liveGameYards[athleteId] ?? null,
  };
};

const getLiveGameYards = async (athleteIds: string[], teams: string[]) => {
  if (!teams.length || !athleteIds.length) {
    return {} as Record<string, number>;
  }

  const response = await fetch(SCOREBOARD_URL, { cache: "no-store" });
  if (!response.ok) {
    return {} as Record<string, number>;
  }

  const data = await response.json();
  const events = Array.isArray(data?.events) ? data.events : [];
  const teamSet = new Set(teams);
  const athleteSet = new Set(athleteIds);
  const liveEventIds = new Set<string>();

  events.forEach((event: { id?: string; competitions?: Array<Record<string, any>>; status?: any }) => {
    const competition = event?.competitions?.[0];
    const state = event?.status?.type?.state;
    if (!competition || state !== "in") return;
    const competitors = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];
    const abbreviations = competitors
      .map((competitor: { team?: { abbreviation?: string } }) => competitor?.team?.abbreviation)
      .filter(Boolean);

    if (abbreviations.some((abbr: string) => teamSet.has(abbr)) && event.id) {
      liveEventIds.add(event.id);
    }
  });

  if (!liveEventIds.size) {
    return {} as Record<string, number>;
  }

  const liveYards: Record<string, number> = {};
  await Promise.all(
    Array.from(liveEventIds).map(async (eventId) => {
      try {
        const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`;
        const summaryResponse = await fetch(summaryUrl, { cache: "no-store" });
        if (!summaryResponse.ok) return;
        const summary = await summaryResponse.json();
        const boxPlayers = Array.isArray(summary?.boxscore?.players)
          ? summary.boxscore.players
          : [];

        boxPlayers.forEach((team: { statistics?: Array<Record<string, any>> }) => {
          const statGroups = Array.isArray(team.statistics) ? team.statistics : [];
          statGroups.forEach((group) => {
            if (group?.name !== "receiving") return;
            const labels = Array.isArray(group.labels) ? group.labels : [];
            const ydsIndex = labels.indexOf("YDS");
            if (ydsIndex < 0) return;
            const athletes = Array.isArray(group.athletes) ? group.athletes : [];
            athletes.forEach((athleteEntry) => {
              const athleteId = athleteEntry?.athlete?.id;
              if (!athleteId || !athleteSet.has(athleteId)) return;
              const stats = Array.isArray(athleteEntry.stats) ? athleteEntry.stats : [];
              const yardsValue = Number(stats[ydsIndex]);
              if (Number.isFinite(yardsValue)) {
                liveYards[athleteId] = yardsValue;
              }
            });
          });
        });
      } catch {
        return;
      }
    })
  );

  return liveYards;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam =
    searchParams.get("ids") || searchParams.get("athleteId") || searchParams.get("id");
  const teamsParam = searchParams.get("teams") || "";

  if (!idsParam) {
    return NextResponse.json(
      { error: "Missing ids parameter" },
      { status: 400 }
    );
  }

  const ids = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const teams = teamsParam
    .split(",")
    .map((team) => team.trim())
    .filter(Boolean);

  if (!ids.length) {
    return NextResponse.json(
      { error: "No valid athlete IDs provided" },
      { status: 400 }
    );
  }

  let seasonYear: number | null = null;
  let currentWeek: number | null = null;
  try {
    const leagueState = await getLeagueState();
    seasonYear = leagueState.seasonYear;
    currentWeek = leagueState.currentWeek;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch league data",
      },
      { status: 502 }
    );
  }

  const liveGameYards = await getLiveGameYards(ids, teams);
  const players = await Promise.all(
    ids.map((athleteId) => fetchPlayerStats(athleteId, seasonYear, liveGameYards))
  );

  return NextResponse.json({
    seasonYear,
    currentWeek,
    fetchedAt: new Date().toISOString(),
    players,
  });
}
