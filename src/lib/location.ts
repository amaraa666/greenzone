export function locationKey(location: string) {
  return location.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const PLACE_MARK = " · ";

export function formatPlace(apartment: string, room: string) {
  const apt = apartment.trim().replace(/\s+/g, " ");
  const rm = room.trim().replace(/\s+/g, " ");
  if (apt && rm) return `${apt}${PLACE_MARK}${rm}`;
  return rm || apt;
}

export function parsePlace(location: string) {
  const trimmed = location.trim().replace(/\s+/g, " ");
  const marked = trimmed.split(/\s*·\s*/);
  if (marked.length >= 2 && marked[0] && marked.slice(1).join("").trim()) {
    return { apartment: marked[0], room: marked.slice(1).join(PLACE_MARK) };
  }
  const slash = trimmed.split(/\s*\/\s*/);
  if (slash.length === 2 && slash[0] && slash[1]) {
    return { apartment: slash[0], room: slash[1] };
  }
  const labeled = trimmed.match(/^(?:apt(?:artment)?|block|building)\s+(.+?)\s+room\s+(.+)$/i);
  if (labeled) return { apartment: labeled[1].trim(), room: labeled[2].trim() };
  return { apartment: "", room: trimmed };
}
