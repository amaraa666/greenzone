"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerTeam } from "@/lib/actions";
import type { TeamStanding } from "@/lib/types";

type MemberDraft = { code: string; fullName: string };

function blankMember(): MemberDraft {
  return { code: "", fullName: "" };
}

export function TeamRegistration({
  teams,
  showRoster = true,
  remember = false,
  id = "teams",
  reportHref,
}: {
  teams: TeamStanding[];
  showRoster?: boolean;
  remember?: boolean;
  id?: string;
  reportHref?: string;
}) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<MemberDraft[]>([blankMember(), blankMember(), blankMember()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateMember(index: number, patch: Partial<MemberDraft>) {
    setMembers((current) => current.map((member, item) => (item === index ? { ...member, ...patch } : member)));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    const result = await registerTeam({ teamName, members });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTeamName("");
    setMembers([blankMember(), blankMember(), blankMember()]);
    setSuccess(`${result.teamName} is registered. Choose it when you file a report.`);
    if (remember) {
      window.localStorage.setItem("gz-team-id", result.teamId);
      window.dispatchEvent(new Event("gz-team"));
    }
    router.refresh();
  }

  return (
    <section id={id} className="rounded-3xl border border-line bg-paper p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-canopy">Roster</p>
      <h2 className="mt-1 font-display text-3xl tracking-tight">Register a team</h2>
      <p className="mt-2 text-sm leading-6 text-moss">
        A team has 3 students. Each person needs a code and a name, and a code can belong to only one team.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block text-sm font-medium">
          Team name
          <input
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            required
            minLength={2}
            maxLength={60}
            placeholder="North Quad"
            className="mt-1 w-full rounded-2xl border border-line bg-sand px-4 py-3 outline-none"
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Students</legend>
          {members.map((member, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[8rem_1fr]">
              <label className="block text-xs font-medium text-moss">
                Student {index + 1} code
                <input
                  value={member.code}
                  onChange={(event) => updateMember(index, { code: event.target.value.toUpperCase() })}
                  required
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="NQ-01"
                  className="mt-1 w-full rounded-2xl border border-line bg-sand px-3 py-3 text-base uppercase outline-none"
                />
              </label>
              <label className="block text-xs font-medium text-moss">
                Full name
                <input
                  value={member.fullName}
                  onChange={(event) => updateMember(index, { fullName: event.target.value })}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Mina Alvarez"
                  className="mt-1 w-full rounded-2xl border border-line bg-sand px-3 py-3 text-base outline-none"
                />
              </label>
            </div>
          ))}
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-canopy-deep px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {pending ? "Registering…" : "Register team"}
        </button>
      </form>

      {error ? <p className="mt-4 rounded-2xl bg-[#fdf4f0] px-4 py-3 text-sm text-clay">{error}</p> : null}
      {success ? (
        <p className="mt-4 rounded-2xl bg-lime px-4 py-3 text-sm font-medium text-ink">
          {success}
          {reportHref ? (
            <>
              {" "}
              <Link href={reportHref} className="underline underline-offset-2">
                Open the report form
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}

      {showRoster && teams.length > 0 ? (
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {teams.map((team) => (
            <li key={team.id} className="py-3">
              <p className="font-medium">{team.teamName}</p>
              <p className="text-sm text-moss">
                {team.members.map((member) => `${member.studentCode} ${member.fullName}`).join(" · ") || "No students yet"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
