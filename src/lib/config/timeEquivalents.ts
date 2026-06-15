// src/lib/config/timeEquivalents.ts — équivalences de temps repris (affichage motivant).
// Calqué sur MONEY_EQUIVALENTS dans wellnessCopy.ts.

export const TIME_EQUIVALENTS: readonly { seuilMinutes: number; label: string }[] = [
	{ seuilMinutes: 30, label: 'un épisode de série 📺' },
	{ seuilMinutes: 90, label: 'un film 🎬' },
	{ seuilMinutes: 240, label: 'une demi-journée 🌤️' },
	{ seuilMinutes: 480, label: 'une rando 🥾' },
	{ seuilMinutes: 720, label: 'un livre lu 📚' },
	{ seuilMinutes: 1440, label: 'une journée entière 🌅' },
	{ seuilMinutes: 4320, label: 'un week-end libéré 🧳' },
	{ seuilMinutes: 10080, label: 'une semaine de vie retrouvée ✨' }
] as const;

/** Formate des minutes en « Xh Ymin » ou « Y min ». */
export function formatMinutes(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (h === 0) return `${m} min`;
	if (m === 0) return `${h} h`;
	return `${h} h ${m} min`;
}
