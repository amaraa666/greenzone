"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { checkLocation, confirmReport, submitReport } from "@/lib/actions";
import { remainingMs, useNow } from "@/components/time-limit";
import { CATEGORIES } from "@/lib/constants";
import { formatWhen } from "@/lib/format";
import { formatPlace, locationKey, parsePlace } from "@/lib/location";
import { CONFIRM_POINTS } from "@/lib/points";
import type { ReportCard } from "@/lib/types";

const MAX_PHOTOS = 3;

type TeamOption = { id: string; teamName: string };
type Shot = { id: string; file: File; preview: string };

function subscribeToTeam(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("gz-team", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("gz-team", onStoreChange);
  };
}

function readSavedTeam() {
  return window.localStorage.getItem("gz-team-id") ?? "";
}

function emptyTeam() {
  return "";
}

export function ReportForm({
  teams,
  initialLocation,
  initialOpenReport,
  loadError,
  deadline,
  initiallyClosed,
}: {
  teams: TeamOption[];
  initialLocation: string;
  initialOpenReport: ReportCard | null;
  loadError: string | null;
  deadline: string | null;
  initiallyClosed: boolean;
}) {
  const router = useRouter();
  const savedTeamId = useSyncExternalStore(subscribeToTeam, readSavedTeam, emptyTeam);
  const initialPlace = parsePlace(initialLocation);
  const [apartment, setApartment] = useState(initialPlace.apartment);
  const [room, setRoom] = useState(initialPlace.room);
  const location = formatPlace(apartment, room);
  const [openReport, setOpenReport] = useState<ReportCard | null>(initialOpenReport);
  const [checking, setChecking] = useState(false);
  const [draftTeamId, setDraftTeamId] = useState<string | null>(null);
  const teamId = draftTeamId ?? (teams.some((team) => team.id === savedTeamId) ? savedTeamId : "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Shot[]>([]);
  const [message, setMessage] = useState<string | null>(loadError);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [filedNote, setFiledNote] = useState<string | null>(null);
  const checkTimer = useRef<number | null>(null);
  const checkRequest = useRef(0);
  const photosRef = useRef<Shot[]>([]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.preview);
    };
  }, []);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("gz-filed-note");
    if (!stored) return;
    window.sessionStorage.removeItem("gz-filed-note");
    setFiledNote(stored);
  }, []);

  function onTeam(value: string) {
    setDraftTeamId(value);
    setConfirmed(null);
    window.localStorage.setItem("gz-team-id", value);
  }

  function onPlace(nextApartment: string, nextRoom: string) {
    setApartment(nextApartment);
    setRoom(nextRoom);
    const value = formatPlace(nextApartment, nextRoom);
    setConfirmed(null);
    const key = locationKey(value);
    setOpenReport((current) => {
      if (!current) return current;
      return locationKey(current.location) === key ? current : null;
    });
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    if (!key) {
      setOpenReport(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const request = checkRequest.current + 1;
    checkRequest.current = request;
    checkTimer.current = window.setTimeout(() => {
      void checkLocation(value).then((result) => {
        if (checkRequest.current !== request) return;
        setChecking(false);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setOpenReport(result.report);
      });
    }, 350);
  }

  function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    const room = MAX_PHOTOS - photosRef.current.length;
    if (room <= 0) return;
    const added = selected.slice(0, room).flatMap((file) => {
      if (!file.type.startsWith("image/")) return [];
      return [{ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }];
    });
    if (added.length === 0) return;
    const next = [...photosRef.current, ...added];
    photosRef.current = next;
    setPhotos(next);
  }

  function removePhoto(id: string) {
    const photo = photosRef.current.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    const next = photosRef.current.filter((item) => item.id !== id);
    photosRef.current = next;
    setPhotos(next);
  }

  function clearPhotos() {
    setPhotos((current) => {
      for (const photo of current) URL.revokeObjectURL(photo.preview);
      photosRef.current = [];
      return [];
    });
  }

  function resetDraft() {
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    checkRequest.current += 1;
    setApartment("");
    setRoom("");
    setCategory(CATEGORIES[0]);
    setDescription("");
    setOpenReport(null);
    setChecking(false);
    setConfirmed(null);
    setMessage(null);
    clearPhotos();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId) {
      setMessage("Choose your team");
      return;
    }
    if (!apartment.trim() || !room.trim()) {
      setMessage("Add the apartment and the room");
      return;
    }
    if (photos.length < 1) {
      setMessage("Add at least one photo");
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("teamId", teamId);
    formData.set("location", location);
    formData.set("category", category);
    formData.set("description", description);
    for (const photo of photos) formData.append("images", photo.file);

    setSubmitting(true);
    setMessage(null);
    setFiledNote(null);
    const result = await submitReport(formData);
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (result.kind === "duplicate") {
      setOpenReport(result.report);
      setMessage("This place already has an open ticket. Confirm it for 5 points.");
      return;
    }
    const note = `${result.report.location} is filed. The desk chooses the points when they review the photo.`;
    resetDraft();
    setFiledNote(note);
    if (window.location.search) {
      window.sessionStorage.setItem("gz-filed-note", note);
      router.replace("/report");
    } else {
      router.refresh();
    }
  }

  async function onConfirm() {
    if (!teamId || !openReport) {
      setMessage("Choose your team to confirm.");
      return;
    }
    setConfirming(true);
    setMessage(null);
    const result = await confirmReport(openReport.id, teamId);
    setConfirming(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setConfirmed(`${result.teamName} earned ${result.points} points.`);
  }

  const selectedTeam = teams.find((team) => team.id === teamId) ?? null;
  const ownReport = Boolean(selectedTeam && openReport && selectedTeam.id === openReport.teamId);
  const now = useNow();
  const left = remainingMs(deadline, now);
  const closed = initiallyClosed || (left !== null && left <= 0);

  if (closed) {
    return (
      <section className="rounded-3xl border border-line bg-paper p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-canopy">Field ticket</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Time is up</h1>
        <p className="mt-3 text-sm leading-6 text-moss">The reporting window is closed. New tickets and confirmations have stopped.</p>
      </section>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-canopy">Field ticket</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight">Эвдрэлийг мэдээллэх хэсэг</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="text-sm font-medium">Байр</span>
          <input
            value={apartment}
            onChange={(event) => onPlace(event.target.value, room)}
            name="apartment-display"
            placeholder="A Байр"
            autoComplete="off"
            required
            className="mt-1 w-full rounded-2xl border border-line bg-paper px-4 py-3 text-lg outline-none"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-sm font-medium">Өрөө</span>
          <input
            value={room}
            onChange={(event) => onPlace(apartment, event.target.value)}
            name="room-display"
            placeholder="302"
            autoComplete="off"
            required
            className="mt-1 w-full rounded-2xl border border-line bg-paper px-4 py-3 text-lg outline-none"
          />
        </label>
      </div>
      {filedNote ? (
        <p className="rounded-2xl bg-lime px-4 py-3 text-sm font-medium text-ink" role="status">
          {filedNote}
        </p>
      ) : null}
      {checking ? <p className="text-xs text-moss">Checking for an open ticket…</p> : null}

      <label className="block">
        <span className="text-sm font-medium">Team</span>
        <select
          value={teamId}
          onChange={(event) => onTeam(event.target.value)}
          required
          className="mt-1 w-full rounded-2xl border border-line bg-paper px-4 py-3 text-lg outline-none"
        >
          <option value="">Багаа сонгоно уу</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.teamName}
            </option>
          ))}
        </select>
      </label>

      {message ? (
        <p className="rounded-2xl border border-clay/30 bg-[#fdf4f0] px-4 py-3 text-sm text-clay" role="status">
          {message}
        </p>
      ) : null}

      {openReport ? (
        <section className="rounded-3xl border border-line bg-paper p-4">
          <p className="text-sm font-medium text-clay">This place already has an open ticket.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={openReport.status} />
            {openReport.status === "Verified" ? <SeverityBadge severity={openReport.severity} /> : null}
            <span className="text-xs text-moss">{formatWhen(openReport.createdAt)}</span>
          </div>
          <h2 className="mt-3 font-display text-3xl tracking-tight">{openReport.location}</h2>
          <p className="mt-1 text-sm text-moss">
            {openReport.category} · filed by {openReport.teamName} · {openReport.confirmations} confirmation
            {openReport.confirmations === 1 ? "" : "s"}
          </p>
          <p className="mt-3 text-sm leading-6">{openReport.description}</p>
          {openReport.imageUrls.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {openReport.imageUrls.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={`Existing report photo ${index + 1} at ${openReport.location}`}
                  className="h-28 w-full rounded-xl bg-[#10261c] object-contain"
                />
              ))}
            </div>
          ) : null}
          <p className="mt-4 text-sm text-moss">
            Confirming adds {CONFIRM_POINTS} points to your team now. Each team can confirm a ticket once. The team
            that filed it cannot confirm it. If an admin rejects it, those points come back off the board.
          </p>
          {confirmed ? (
            <p className="mt-3 rounded-2xl bg-lime px-4 py-3 text-sm font-medium text-ink">{confirmed}</p>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming || !teamId || ownReport}
              className="mt-4 w-full rounded-full bg-lime px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {confirming
                ? "Saving confirmation…"
                : ownReport
                  ? "Your team filed this ticket"
                  : `Confirm this issue · +${CONFIRM_POINTS} pts`}
            </button>
          )}
        </section>
      ) : (
        <form onSubmit={onSubmit} className="min-w-0 space-y-4 overflow-hidden rounded-3xl border border-line bg-paper p-4">
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Эвдрэлийн төрөл</legend>
            <div className="mt-2 flex w-full min-w-0 gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                    category === item ? "bg-canopy-deep text-paper" : "bg-sand text-ink"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <p className="text-sm font-medium">Зурган мэдээлэл /заавал/</p>
            <p className="mt-1 text-xs text-moss">Up to {MAX_PHOTOS}. Зургыг чанартай юу яаж эвдэрсэн вэ гэдгийг мэдэгдэхүйцээр оруулна уу.</p>
            {photos.length > 0 ? (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <li key={photo.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.preview}
                      alt={`Selected photo ${index + 1}`}
                      className="h-28 w-full rounded-xl bg-[#10261c] object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute right-1 top-1 rounded-full bg-paper px-2 py-0.5 text-xs font-medium"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {photos.length < MAX_PHOTOS ? (
              <div className="relative mt-3 overflow-hidden rounded-2xl border border-dashed border-canopy bg-mist">
                <input
                  id="report-photo"
                  name="camera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onPhoto}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                <div className="grid h-28 place-items-center px-6 text-center">
                  <div>
                    <p className="font-medium">Take photo {photos.length + 1} of {MAX_PHOTOS}</p>
                    <p className="mt-1 text-sm text-moss">Opens the rear camera on a phone.</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-moss">3 photos added.</p>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium">Юу эвдэрсэн вэ? Тайлбар оруулна уу</span>
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              minLength={8}
              maxLength={1000}
              rows={4}
              placeholder="The ceiling light above the third desk flickers and goes dark."
              className="mt-1 w-full rounded-2xl border border-line bg-sand px-4 py-3 outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !teamId}
            className="w-full rounded-full bg-canopy-deep px-4 py-3 text-sm font-semibold text-paper disabled:opacity-50"
          >
            {submitting ? "Илгээж байна…" : "Илгээх"}
          </button>
        </form>
      )}
    </div>
  );
}
