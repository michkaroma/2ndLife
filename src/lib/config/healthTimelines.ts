// src/lib/config/healthTimelines.ts
// Frises de récupération / de reprise, par type d'addiction. Ton bienveillant et NON
// médical : repères de motivation, pas d'affirmations cliniques.

export interface HealthMilestone {
	afterLabel: string;
	afterSeconds: number;
	title: string;
	message: string;
}

export type HealthTimelineKey = 'tabac' | 'alcool' | 'sucre' | 'ecrans' | 'reseaux' | 'jeux' | 'autre';

const MIN = 60;
const HEURE = 60 * MIN;
const JOUR = 24 * HEURE;
const SEMAINE = 7 * JOUR;
const MOIS = 30 * JOUR;
const AN = 365 * JOUR;

export const HEALTH_TIMELINES: Record<HealthTimelineKey, HealthMilestone[]> = {
	tabac: [
		{ afterLabel: '20 minutes', afterSeconds: 20 * MIN, title: 'Le corps se détend', message: "Quelques minutes seulement, et beaucoup de personnes constatent déjà un léger mieux. Ton corps a commencé à se rééquilibrer. Joli début." },
		{ afterLabel: '8 heures',   afterSeconds: 8 * HEURE, title: 'Un souffle plus clair', message: "Après quelques heures, on rapporte souvent une respiration qui paraît plus légère. Continue, ça travaille pour toi." },
		{ afterLabel: '24 heures',  afterSeconds: JOUR,      title: 'Une journée entière !', message: "Une journée complète sans tabac, c'est une vraie victoire. Beaucoup décrivent une sensation de fierté qui fait du bien." },
		{ afterLabel: '48 heures',  afterSeconds: 2 * JOUR,  title: 'Les sens se réveillent', message: "Au bout de deux jours, certaines personnes redécouvrent le goût et les odeurs. Reste à l'écoute de ces petits plaisirs retrouvés." },
		{ afterLabel: '72 heures',  afterSeconds: 3 * JOUR,  title: "Plus d'énergie", message: "Trois jours : le plus dur des envies passe souvent par là. Beaucoup se sentent ensuite plus légers et plus énergiques." },
		{ afterLabel: '2 semaines', afterSeconds: 2 * SEMAINE, title: 'Le quotidien plus facile', message: "Après deux semaines, bouger et respirer paraît souvent plus simple. Tu construis quelque chose de solide." },
		{ afterLabel: '1 mois',     afterSeconds: MOIS,      title: 'Un mois de gagné', message: "Un mois entier. Beaucoup remarquent une toux qui s'apaise et un teint plus frais. Tu peux être vraiment fier." },
		{ afterLabel: '3 mois',     afterSeconds: 3 * MOIS,  title: 'Le souffle au top', message: "Trois mois : on rapporte souvent une nette amélioration du souffle au quotidien. La forme revient peu à peu." },
		{ afterLabel: '1 an',       afterSeconds: AN,        title: 'Une année de liberté', message: "Une année complète ! C'est un cap énorme, célébré par beaucoup comme un vrai tournant. Bravo, sincèrement." }
	],
	alcool: [
		{ afterLabel: '24 heures',  afterSeconds: JOUR,      title: 'Le corps souffle', message: "Une journée sans alcool, et le corps commence à se reposer. Beaucoup décrivent une hydratation qui revient et une tête plus claire." },
		{ afterLabel: '48 heures',  afterSeconds: 2 * JOUR,  title: 'Esprit plus net', message: "Au bout de deux jours, on rapporte souvent des idées plus claires. Profite de cette netteté retrouvée." },
		{ afterLabel: '72 heures',  afterSeconds: 3 * JOUR,  title: 'Le sommeil s\'installe', message: "Trois jours : beaucoup de personnes constatent un sommeil qui redevient peu à peu plus réparateur." },
		{ afterLabel: '1 semaine',  afterSeconds: SEMAINE,   title: 'Une semaine, déjà', message: "Une semaine entière ! On rapporte souvent un meilleur sommeil et plus d'énergie le matin. Continue sur ta lancée." },
		{ afterLabel: '2 semaines', afterSeconds: 2 * SEMAINE, title: 'La forme revient', message: "Deux semaines : beaucoup décrivent une meilleure hydratation de la peau et une humeur plus stable. Ça paie." },
		{ afterLabel: '1 mois',     afterSeconds: MOIS,      title: 'Un mois lumineux', message: "Un mois sans alcool. Beaucoup parlent d'un teint plus frais, d'un meilleur sommeil et d'un vrai regain d'énergie." },
		{ afterLabel: '3 mois',     afterSeconds: 3 * MOIS,  title: 'Une nouvelle habitude', message: "Trois mois : ce qui semblait difficile devient ta nouvelle normalité. Beaucoup se sentent plus en maîtrise de leurs choix." },
		{ afterLabel: '6 mois',     afterSeconds: 6 * MOIS,  title: 'Un demi-cap', message: "Six mois, c'est un cap rare et précieux. On rapporte souvent une énergie et une sérénité durables. Magnifique." },
		{ afterLabel: '1 an',       afterSeconds: AN,        title: 'Une année entière', message: "Un an ! Un accomplissement immense, vécu par beaucoup comme une vraie renaissance. Tu peux être très fier de toi." }
	],
	sucre: [
		{ afterLabel: '24 heures',  afterSeconds: JOUR,      title: 'Premier jour posé', message: "Une journée sans excès de sucre. Les premières envies sont les plus fortes : tu viens d'en traverser une belle part." },
		{ afterLabel: '3 jours',    afterSeconds: 3 * JOUR,  title: "Les envies s'apaisent", message: "Trois jours : beaucoup de personnes constatent que l'envie de sucré devient moins insistante. Tiens bon, ça s'adoucit." },
		{ afterLabel: '1 semaine',  afterSeconds: SEMAINE,   title: 'Plus stable', message: "Une semaine : on rapporte souvent moins de coups de barre dans la journée et une énergie plus régulière." },
		{ afterLabel: '2 semaines', afterSeconds: 2 * SEMAINE, title: 'Le goût se rééduque', message: "Deux semaines : beaucoup redécouvrent le goût naturel des aliments, et trouvent certaines choses « trop sucrées » désormais." },
		{ afterLabel: '1 mois',     afterSeconds: MOIS,      title: 'Un mois plus léger', message: "Un mois : on rapporte souvent une énergie plus stable et une relation plus apaisée avec le sucré. Beau travail." },
		{ afterLabel: '3 mois',     afterSeconds: 3 * MOIS,  title: 'Nouvelle habitude ancrée', message: "Trois mois : tes nouveaux réflexes deviennent naturels. Beaucoup se sentent plus libres face aux tentations." }
	],
	ecrans: [
		{ afterLabel: '1 heure',    afterSeconds: HEURE,     title: 'Une heure pour toi', message: "Une heure sans scroller, c'est déjà du temps repris. Beaucoup ressentent un petit soulagement de poser le téléphone." },
		{ afterLabel: '24 heures',  afterSeconds: JOUR,      title: 'Une journée présente', message: "Une journée avec moins d'écrans. On rapporte souvent une attention plus calme et des moments mieux savourés." },
		{ afterLabel: '3 jours',    afterSeconds: 3 * JOUR,  title: "L'esprit respire", message: "Trois jours : beaucoup décrivent moins de besoin compulsif de vérifier leur téléphone. L'esprit se pose." },
		{ afterLabel: '1 semaine',  afterSeconds: SEMAINE,   title: 'Du temps retrouvé', message: "Une semaine : on rapporte souvent du temps libéré pour de vraies envies, et un sommeil plus tranquille le soir." },
		{ afterLabel: '2 semaines', afterSeconds: 2 * SEMAINE, title: 'Plus concentré', message: "Deux semaines : beaucoup constatent une concentration qui revient et une attention plus longue sur ce qui compte." },
		{ afterLabel: '1 mois',     afterSeconds: MOIS,      title: 'Un mois recentré', message: "Un mois : on rapporte souvent une relation plus sereine aux écrans et plus de présence dans le quotidien. Bravo." }
	],
	reseaux: [
		{ afterLabel: '30 min',     afterSeconds: 30 * MIN,  title: 'Trente minutes pour toi', message: "Trente minutes sans ouvrir les apps : c'est une habitude qui se construit. Beaucoup décrivent un léger sentiment de légèreté." },
		{ afterLabel: '3 heures',   afterSeconds: 3 * HEURE, title: 'La tête moins dans le flux', message: "Trois heures loin du scroll. On rapporte souvent plus de facilité à rester concentré sur ce qui compte vraiment." },
		{ afterLabel: '24 heures',  afterSeconds: JOUR,      title: 'Une journée sans flux', message: "Une journée entière sans réseaux. Beaucoup remarquent qu'ils savent mieux quoi faire de leur temps." },
		{ afterLabel: '3 jours',    afterSeconds: 3 * JOUR,  title: "L'esprit se pose", message: "Trois jours : on rapporte souvent moins d'irritabilité et un meilleur sommeil. Le cerveau reprend son rythme naturel." },
		{ afterLabel: '1 semaine',  afterSeconds: SEMAINE,   title: 'Du temps repris', message: "Une semaine : beaucoup décrivent du temps libéré pour des activités qui leur manquaient. Ce temps est vraiment à toi." },
		{ afterLabel: '1 mois',     afterSeconds: MOIS,      title: 'Un mois de présence', message: "Un mois : on rapporte souvent des relations plus vraies et une attention retrouvée pour les moments du quotidien. Magnifique." }
	],
	jeux: [
		{ afterLabel: '1 heure',    afterSeconds: HEURE,     title: 'Une heure gagnée', message: "Une heure de moins sur les jeux. Pas de jugement — c'est juste du temps que tu peux décider d'utiliser autrement." },
		{ afterLabel: '24 heures',  afterSeconds: JOUR,      title: 'Une journée différente', message: "Une journée sans jouer. Beaucoup décrivent une surprise : trouver du temps pour des choses oubliées." },
		{ afterLabel: '3 jours',    afterSeconds: 3 * JOUR,  title: "Les envies s'espacent", message: "Trois jours : l'envie compulsive de jouer se calme souvent. Beaucoup se sentent moins tiraillés." },
		{ afterLabel: '1 semaine',  afterSeconds: SEMAINE,   title: 'Du temps pour soi', message: "Une semaine : on rapporte souvent un meilleur sommeil et plus d'énergie pour d'autres activités. Beau travail." },
		{ afterLabel: '2 semaines', afterSeconds: 2 * SEMAINE, title: 'Une nouvelle routine', message: "Deux semaines : des nouvelles habitudes commencent à prendre la place. C'est toi qui choisis comment remplir ce temps." },
		{ afterLabel: '1 mois',     afterSeconds: MOIS,      title: 'Un mois de maîtrise', message: "Un mois : beaucoup décrivent une relation plus libre aux jeux, où c'est eux qui choisissent — et non l'inverse." }
	],
	autre: [
		{ afterLabel: '24 heures',  afterSeconds: JOUR,      title: 'Le premier jour', message: "Un jour entier, c'est un vrai début. Le plus dur est souvent de commencer : c'est fait. Sois fier de ce pas." },
		{ afterLabel: '3 jours',    afterSeconds: 3 * JOUR,  title: "Ça s'apaise", message: "Trois jours : beaucoup de personnes constatent que les envies les plus fortes commencent à s'espacer. Tiens bon." },
		{ afterLabel: '1 semaine',  afterSeconds: SEMAINE,   title: 'Une semaine de gagnée', message: "Une semaine complète ! On rapporte souvent un regain de confiance à ce stade. Tu prouves que tu en es capable." },
		{ afterLabel: '2 semaines', afterSeconds: 2 * SEMAINE, title: 'Sur la bonne voie', message: "Deux semaines : tes nouveaux réflexes commencent à s'installer. Chaque jour ajoute une brique solide." },
		{ afterLabel: '1 mois',     afterSeconds: MOIS,      title: 'Un mois, bravo', message: "Un mois entier. Beaucoup décrivent une vraie fierté et une habitude qui devient plus naturelle. Continue." },
		{ afterLabel: '3 mois',     afterSeconds: 3 * MOIS,  title: 'Solidement ancré', message: "Trois mois : ce qui était un effort devient ta nouvelle normalité. Tu as transformé ton quotidien." },
		{ afterLabel: '1 an',       afterSeconds: AN,        title: 'Une année entière', message: "Une année complète ! Un cap immense. Prends un instant pour mesurer le chemin parcouru. Chapeau." }
	]
};

/** Sélecteur tolérant (kind null/inconnu → 'autre'). */
export function timelineFor(kind: string | null | undefined): HealthMilestone[] {
	if (kind && kind in HEALTH_TIMELINES) return HEALTH_TIMELINES[kind as HealthTimelineKey];
	return HEALTH_TIMELINES.autre;
}
