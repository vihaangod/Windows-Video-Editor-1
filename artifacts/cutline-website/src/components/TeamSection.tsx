import { useEffect, useState } from "react";
import {
  getGetTeamProfilesQueryKey,
  useGetTeamProfiles,
  type TeamMember,
} from "@workspace/api-client-react";

const fallbackMembers: TeamMember[] = [
  { slug: "vihaan", name: "Vihaan", role: "Founder", displayName: null, username: null, avatarUrl: null, profileAvailable: false },
  { slug: "neyo", name: "Neyo", role: "Team Member", displayName: null, username: null, avatarUrl: null, profileAvailable: false },
  { slug: "arshit", name: "Arshit", role: "English Yapper", displayName: null, username: null, avatarUrl: null, profileAvailable: false },
  { slug: "revu", name: "Revu", role: "Certified Chaos Agent", displayName: null, username: null, avatarUrl: null, profileAvailable: false },
  { slug: "parth", name: "Parth", role: "Broken-Heart Specialist", displayName: null, username: null, avatarUrl: null, profileAvailable: false },
  { slug: "cisko", name: "Cisko", role: "Final Lobby Boss", displayName: null, username: null, avatarUrl: null, profileAvailable: false },
  { slug: "jatin", name: "Jatin", role: "Certified Cooking Minister", displayName: null, username: null, avatarUrl: null, profileAvailable: false },
];

function MemberAvatar({ member }: { member: TeamMember }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = member.avatarUrl !== null && failedUrl !== member.avatarUrl;
  const initials = member.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  if (showImage) {
    return (
      <img
        className="team-avatar"
        src={member.avatarUrl ?? undefined}
        alt={`${member.name} Discord avatar`}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(member.avatarUrl)}
      />
    );
  }

  return (
    <span className="team-avatar team-avatar-fallback" role="img" aria-label={`${member.name} avatar unavailable`}>
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}

function MemberCard({
  member,
  duplicate = false,
}: {
  member: TeamMember;
  duplicate?: boolean;
}) {
  const displayName =
    member.displayName?.trim().toLocaleLowerCase() === member.name.toLocaleLowerCase()
      ? null
      : member.displayName;

  return (
    <article
      className="team-card"
      tabIndex={duplicate ? -1 : 0}
      aria-label={`${member.name}, ${member.role}`}
      key={`${member.slug}-${duplicate ? "copy" : "original"}`}
    >
      <div className="team-avatar-wrap">
        <MemberAvatar member={member} />
        <span className="team-card-index mono">{member.slug.toUpperCase()}</span>
      </div>
      <div className="team-card-copy">
        <h3>{member.name}</h3>
        {displayName && <p className="team-display-name">{displayName}</p>}
        <p className="team-role">{member.role}</p>
        <p className="team-username">
          {member.username ? `@${member.username}` : "Discord profile unavailable"}
        </p>
      </div>
      <span className="team-card-mark" aria-hidden="true">C<span>↗</span></span>
    </article>
  );
}

export function TeamSection() {
  const { data, isError } = useGetTeamProfiles({
    query: {
      queryKey: getGetTeamProfilesQueryKey(),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  });
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const members = data?.members ?? fallbackMembers;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    syncMotionPreference();
    mediaQuery.addEventListener("change", syncMotionPreference);
    return () => mediaQuery.removeEventListener("change", syncMotionPreference);
  }, []);

  let profileMessage = "Discord profile details refresh when available; the team roster stays visible if Discord cannot be reached.";
  if (isError || data?.status === "offline") {
    profileMessage = "Discord profiles are unavailable right now. Names and roles remain visible with fallback avatars.";
  } else if (data?.status === "partial") {
    profileMessage = "Some Discord profiles could not be retrieved. Those members use fallback avatars and names.";
  }

  return (
    <section className="team-section" id="team" aria-labelledby="team-title">
      <div className="team-inner section-wrap">
        <div className="team-heading">
          <div>
            <div className="section-label mono"><span>04</span> / THE PEOPLE BEHIND THE CUT</div>
            <h2 id="team-title">Meet the <em>team.</em></h2>
          </div>
          <p>Seven different personalities, one shared love of making things worth watching.</p>
        </div>

        <div
          className={`team-marquee${manuallyPaused ? " is-paused" : ""}`}
          role="region"
          aria-label="Cutline team members"
        >
          <div className="team-viewport">
            <div className="team-track">
              <div className="team-card-set">
                {members.map((member) => (
                  <MemberCard key={member.slug} member={member} />
                ))}
              </div>
              <div className="team-card-set team-card-set-copy" aria-hidden="true">
                {members.map((member) => (
                  <MemberCard key={member.slug} member={member} duplicate />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="team-foot">
          <p className="team-profile-status" aria-live="polite">{profileMessage}</p>
          <button
            className="team-motion-toggle focus-ring"
            type="button"
            aria-label={prefersReducedMotion ? "Reduced motion is enabled" : manuallyPaused ? "Resume team marquee" : "Pause team marquee"}
            aria-pressed={manuallyPaused}
            disabled={prefersReducedMotion}
            onClick={() => setManuallyPaused((paused) => !paused)}
          >
            {prefersReducedMotion ? "MOTION REDUCED" : manuallyPaused ? "RESUME MARQUEE" : "PAUSE MARQUEE"}
          </button>
        </div>
      </div>
    </section>
  );
}
