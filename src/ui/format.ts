/** 83.456 -> "1:23.45"; under a minute -> "23.45". */
export function formatTime(seconds: number): string {
  const t = Math.max(0, seconds);
  const whole = Math.floor(t * 100 + 1e-6);
  const cs = whole % 100;
  const s = Math.floor(whole / 100) % 60;
  const m = Math.floor(whole / 6000);
  const tail = `${String(s).padStart(m > 0 ? 2 : 1, '0')}.${String(cs).padStart(2, '0')}`;
  return m > 0 ? `${m}:${tail}` : tail;
}
