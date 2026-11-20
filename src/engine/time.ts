export function toMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  const hours = Number(match[1]), minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time: ${value}`);
  return hours * 60 + minutes;
}
export function fromMinutes(value: number): string {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2,'0')}:${String(normalized % 60).padStart(2,'0')}`;
}
export function displayMinutes(value: number): string {
  const h = Math.floor(value / 60), m = value % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
