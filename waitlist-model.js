export const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const HEADERS = ['대기ID', '회원ID', '회원명', '연락처', '유형', '강사캘린더ID', '강사명', '희망요일', '시작일', '종료일', '가능시작시간', '가능종료시간', '상태', '메모', '등록시각', '수정시각'];
export const KEYS = ['id', 'memberId', 'name', 'phone', 'type', 'coachId', 'coachName', 'days', 'from', 'until', 'start', 'end', 'status', 'memo', 'created', 'updated'];
export function decode(rows) {
  const latest = new Map();
  rows.forEach(row => { if (row[0]) latest.set(row[0], Object.fromEntries(KEYS.map((key, i) => [key, row[i] || '']))); });
  return [...latest.values()];
}
export function encode(record) { return KEYS.map(key => record[key] || ''); }
export function validate(record) {
  if (!['단발', '장기'].includes(record.type) || !['대기', '연결완료', '취소'].includes(record.status)) throw new Error('대기 유형과 상태를 확인해주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.from) || (record.until && !/^\d{4}-\d{2}-\d{2}$/.test(record.until))) throw new Error('날짜를 확인해주세요.');
  if (![record.start, record.end].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('시간을 확인해주세요.');
  if (record.days && !record.days.split(',').every(d => /^[0-6]$/.test(d))) throw new Error('요일을 확인해주세요.');
  if (!record.name.trim()) throw new Error('회원명을 입력해주세요.');
  if (!record.from || (record.until && record.until < record.from)) throw new Error('대기 기간을 확인해주세요.');
  if (!record.start || !record.end || record.start >= record.end) throw new Error('가능 종료시간은 시작시간보다 늦어야 합니다.');
  if (record.type === '단발' && record.until !== record.from) throw new Error('단발 대기는 동일한 날짜로 등록해주세요.');
  if (record.type === '장기' && !record.days) throw new Error('희망 요일을 하나 이상 선택해주세요.');
}
export function matches(record, slot) {
  if (record.status !== '대기' || !slot.date || !slot.start || !slot.end || slot.end <= slot.start) return false;
  if (record.coachId && record.coachId !== slot.coachId) return false;
  if (slot.date < record.from || (record.until && slot.date > record.until)) return false;
  if (record.type === '단발' && slot.date !== record.from) return false;
  const day = String(new Date(`${slot.date}T12:00:00+09:00`).getUTCDay());
  if (record.type === '장기' && !record.days.split(',').includes(day)) return false;
  return !!record.start && !!record.end && record.start <= slot.start && record.end >= slot.end;
}
export function candidates(records, slot) {
  const seen = new Set();
  return records.filter(r => matches(r, slot)).sort((a, b) => a.created.localeCompare(b.created)).filter(r => {
    const key = r.memberId || `${r.name}|${r.phone}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
