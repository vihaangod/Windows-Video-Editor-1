import { Router, type IRouter } from "express";
import {
  GetTeamProfilesResponse,
  type TeamProfilesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const PROFILE_CACHE_MS = 5 * 60 * 1000;
const DISCORD_API = "https://discord.com/api/v10";

const roster = [
  {
    slug: "vihaan",
    name: "Vihaan",
    role: "Founder",
    discordId: "1217138532053815319",
  },
  {
    slug: "neyo",
    name: "Neyo",
    role: "Team Member",
    discordId: "936511340288299058",
  },
  {
    slug: "arshit",
    name: "Arshit",
    role: "English Yapper",
    discordId: "1371818278455869510",
  },
  {
    slug: "revu",
    name: "Revu",
    role: "Certified Chaos Agent",
    discordId: "1323921871787393088",
  },
  {
    slug: "parth",
    name: "Parth",
    role: "Broken-Heart Specialist",
    discordId: null,
  },
  {
    slug: "cisko",
    name: "Cisko",
    role: "Final Lobby Boss",
    discordId: "799986687475580999",
  },
  {
    slug: "jatin",
    name: "Jatin",
    role: "Certified Cooking Minister",
    discordId: "1316754985807122526",
  },
] as const;

type DiscordUser = {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
  avatar?: unknown;
};

let profileCache:
  | { expiresAt: number; response: TeamProfilesResponse }
  | undefined;

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function fetchProfile(
  discordId: string,
  botToken: string,
): Promise<{ displayName: string | null; username: string | null; avatarUrl: string | null }> {
  const response = await fetch(`${DISCORD_API}/users/${discordId}`, {
    headers: { Authorization: `Bot ${botToken}` },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Discord returned HTTP ${response.status}`);
  }

  const user = (await response.json()) as DiscordUser;
  if (user.id !== discordId) {
    throw new Error("Discord profile ID did not match the requested member");
  }

  const avatarHash = stringOrNull(user.avatar);
  const avatarExtension = avatarHash?.startsWith("a_") ? "gif" : "webp";

  return {
    displayName: stringOrNull(user.global_name),
    username: stringOrNull(user.username),
    avatarUrl: avatarHash
      ? `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${avatarExtension}?size=256`
      : null,
  };
}

async function loadTeamProfiles(
  botToken: string | undefined,
  log: { warn: (context: object, message: string) => void },
): Promise<TeamProfilesResponse> {
  const members = await Promise.all(
    roster.map(async (member) => {
      const fallback = {
        slug: member.slug,
        name: member.name,
        role: member.role,
        displayName: null,
        username: null,
        avatarUrl: null,
        profileAvailable: false,
      };

      if (!member.discordId || !botToken) {
        return fallback;
      }

      try {
        return {
          ...fallback,
          ...(await fetchProfile(member.discordId, botToken)),
          profileAvailable: true,
        };
      } catch (error) {
        log.warn(
          {
            member: member.slug,
            error: error instanceof Error ? error.message : "Unknown Discord error",
          },
          "Discord member profile unavailable; using fallback details",
        );
        return fallback;
      }
    }),
  );

  const availableProfiles = members.filter((member) => member.profileAvailable).length;
  const status =
    availableProfiles === 0
      ? "offline"
      : availableProfiles === members.length
        ? "live"
        : "partial";

  return GetTeamProfilesResponse.parse({ status, members });
}

router.get("/team", async (req, res): Promise<void> => {
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");

  if (profileCache && profileCache.expiresAt > Date.now()) {
    res.json(profileCache.response);
    return;
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    req.log.warn(
      "DISCORD_BOT_TOKEN is unavailable; returning the team roster with fallback avatars",
    );
  }

  const response = await loadTeamProfiles(botToken, req.log);
  profileCache = {
    response,
    expiresAt: Date.now() + PROFILE_CACHE_MS,
  };

  res.json(response);
});

export default router;
