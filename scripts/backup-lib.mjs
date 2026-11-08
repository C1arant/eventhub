// Pure helpers for backup retention. Folder names are YYYY-MM-DD (local date of the backup).
const DATE_DIR = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns the folder names outside the newest `keepDays` daily folders (today + keepDays-1 previous days) relative to `today` (YYYY-MM-DD). Ignores non-date names. */
export function foldersToPrune(names, today, keepDays = 14) {
	const toDay = (s) => {
		const m = DATE_DIR.exec(s);
		return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000 : null;
	};
	const now = toDay(today);
	if (now === null) throw new Error(`Bad date: ${today}`);
	return names.filter((n) => {
		const d = toDay(n);
		return d !== null && now - d >= keepDays;
	});
}

export function localDate(d = new Date()) {
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
