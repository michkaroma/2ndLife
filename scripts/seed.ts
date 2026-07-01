// scripts/seed.ts — données de démo. Lancer : npm run seed
// Idempotent : vide les tables de jeu puis réinsère, dates relatives à aujourd'hui
// (séries toujours « actuelles »). Aligné sur le schéma final.
import { getDb, initDb, localDate } from '../src/lib/server/db';
import { seedAchievementsCatalog, runAchievementChecks } from '../src/lib/server/achievements';
import { seedShop } from '../src/lib/server/shop';

function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return localDate(d);
}
const today = daysAgo(0);

initDb();
const db = getDb();
seedAchievementsCatalog();

const seed = db.transaction(() => {
	// 0. Reset (enfants d'abord)
	db.exec(`
    DELETE FROM daily_checkins;
    DELETE FROM trigger_journal;
    DELETE FROM weekly_goal_awards;
    DELETE FROM habit_logs;
    DELETE FROM quests;
    DELETE FROM owned_cosmetics;
    DELETE FROM rewards;
    DELETE FROM addiction_targets;
    DELETE FROM one_time_tasks;
    DELETE FROM habits;
    DELETE FROM level_events;
    UPDATE achievements SET unlocked_at = NULL;
    DELETE FROM sqlite_sequence WHERE name IN
      ('habits','habit_logs','quests','rewards','addiction_targets','trigger_journal','owned_cosmetics','level_events','daily_checkins','one_time_tasks');
  `);

	// 1. user_state (≈ niveau 10) + nom de personnage de démo
	db.prepare(
		`UPDATE user_state SET total_xp=12000, coins=640, prestige=0, freezes=2,
       last_active=?, last_freeze_grant=NULL,
       equipped_theme_id=NULL, equipped_skin_id=NULL,
       equipped_accessory_id=NULL, equipped_frame_id=NULL,
       player_name='Sieur Galahad'
     WHERE id=1`
	).run(today);

	// 2. habits
	const insHabit = db.prepare(
		`INSERT INTO habits (id, name, type, category, difficulty, icon, archived, sort_order, created_at)
     VALUES (@id,@name,@type,@category,@difficulty,@icon,0,@id,@created_at)`
	);
	const habits = [
		{ id: 1, name: "Boire 2 L d'eau", type: 'build', category: 'Santé', difficulty: 1, icon: '💧', created_at: daysAgo(29) },
		{ id: 2, name: '30 min de sport', type: 'build', category: 'Forme', difficulty: 2, icon: '🏋️', created_at: daysAgo(30) },
		{ id: 3, name: 'Lecture 20 min', type: 'build', category: 'Esprit', difficulty: 1, icon: '📖', created_at: daysAgo(13) },
		{ id: 4, name: 'Méditation', type: 'build', category: 'Bien-être', difficulty: 2, icon: '🧘', created_at: daysAgo(20) },
		{ id: 5, name: 'Pas de sucre raffiné', type: 'break', category: 'Alimentation', difficulty: 3, icon: '🍩', created_at: daysAgo(29) },
		{ id: 6, name: 'Coucher avant 23h', type: 'build', category: 'Sommeil', difficulty: 2, icon: '🌙', created_at: daysAgo(30) }
	];
	habits.forEach((h) => insHabit.run(h));

	// Habitude à quota hebdomadaire (Feature 3) : « X fois / semaine ».
	db.prepare(
		`INSERT INTO habits (id, name, type, category, difficulty, icon, frequency_type, weekly_quota, archived, sort_order, created_at)
     VALUES (?,?,?,?,?,?,?,?,0,?,?)`
	).run(7, 'Appeler un proche', 'build', 'Social', 1, '📞', 'weekly', 2, 7, daysAgo(28));

	// 3. habit_logs (séries + gaps)
	const insLog = db.prepare(
		`INSERT OR IGNORE INTO habit_logs (habit_id, date, status, note) VALUES (?, ?, ?, ?)`
	);
	for (let n = 29; n >= 0; n--) insLog.run(1, daysAgo(n), 'done', null); // 30 j
	for (let n = 29; n >= 8; n--) if ((29 - n) % 4 !== 3) insLog.run(2, daysAgo(n), 'done', null);
	for (let n = 7; n >= 0; n--) insLog.run(2, daysAgo(n), 'done', null); // 8 j actifs
	for (let n = 13; n >= 0; n--) insLog.run(3, daysAgo(n), 'done', null); // 14 j
	for (let n = 20; n >= 6; n--) insLog.run(4, daysAgo(n), 'done', null);
	insLog.run(4, daysAgo(5), 'skipped', 'Journée chargée.');
	for (let n = 3; n >= 0; n--) insLog.run(4, daysAgo(n), 'done', null);
	for (let n = 29; n >= 0; n--) {
		if (n === 11) insLog.run(5, daysAgo(11), 'relapsed', 'Rechute notée. On repart, sans se juger.');
		else insLog.run(5, daysAgo(n), 'done', null);
	}
	const skip6 = new Set([29, 27, 24, 23, 19, 16, 12, 9, 6]);
	for (let n = 29; n >= 0; n--) if (!skip6.has(n)) insLog.run(6, daysAgo(n), 'done', null);

	// Habitude hebdo « Appeler un proche » : ~2 check-ins/semaine sur les 3 dernières
	// semaines (série hebdo) + 1 cette semaine (en cours → 1/2). Réparti ~tous les 3-4 j.
	for (const n of [1, 8, 11, 15, 18, 22, 25]) insLog.run(7, daysAgo(n), 'done', null);

	// 4. addiction_targets (boss) — substance + comportementaux
	const insTarget = db.prepare(`
    INSERT INTO addiction_targets
      (id, name, clean_since, money_per_day, best_streak_days, target_streak_days, kind, icon,
       mode, daily_limit_minutes, no_use_before,
       baseline_minutes_per_day, track_time, track_money)
    VALUES (?,?,?,?,?,?,?,?, ?,?,?, ?,?,?)`);

	// Boss substance : abstinence classique
	insTarget.run(
		1, 'Cigarette', daysAgo(73), 12.5, 73, 90, 'tabac', '🚬',
		'abstinence', null, null,
		0, 0, 1
	);
	insTarget.run(
		2, 'Sucre / grignotage', daysAgo(11), 4.0, 41, 60, 'sucre', '🍩',
		'abstinence', null, null,
		0, 0, 1
	);
	// Boss comportemental : réseaux sociaux avec limite journalière
	insTarget.run(
		3, 'Réseaux sociaux', daysAgo(14), 0, 14, 30, 'reseaux', '📱',
		'limit', 45, null,
		120, 1, 0
	);

	// 5. trigger_journal (heures variées pour les tendances)
	const insTrig = db.prepare(
		`INSERT INTO trigger_journal (target_id, date, trigger, craving, note, gave_in) VALUES (?,?,?,?,?,?)`
	);
	insTrig.run(1, `${daysAgo(20)} 08:15:00`, 'Café du matin', 7, "Réflexe avec le café, j'ai tenu en respirant.", 0);
	insTrig.run(1, `${daysAgo(12)} 18:40:00`, 'Stress au travail', 9, 'Grosse envie après une réunion difficile.', 0);
	insTrig.run(1, `${daysAgo(4)} 21:10:00`, 'Soirée entre amis', 6, "Tentation sociale, j'ai bu un verre d'eau à la place.", 0);
	insTrig.run(2, `${daysAgo(11)} 22:30:00`, 'Ennui le soir', 8, "J'ai cédé, mais je note et je repars demain.", 1);
	insTrig.run(2, `${daysAgo(2)} 16:00:00`, 'Fatigue après-midi', 5, 'Envie de sucré, remplacée par un fruit.', 0);
	insTrig.run(3, `${daysAgo(3)} 20:00:00`, 'Ennui du soir', 6, "Scroll automatique, j'ai posé le téléphone.", 0);

	// 6. Tâches ponctuelles (Feature 1) : 3 à faire + 1 déjà terminée.
	const insTask = db.prepare(
		`INSERT INTO one_time_tasks (title, note, due_date, difficulty, status, xp_awarded, coins_awarded, sort_order, completed_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
	);
	insTask.run('Prendre RDV chez le dentiste', null, daysAgo(-5), 1, 'todo', 0, 0, 1, null);
	insTask.run('Trier les papiers administratifs', 'Avant la fin du mois.', null, 2, 'todo', 0, 0, 2, null);
	insTask.run("Réserver les vacances d'été", null, daysAgo(-20), 3, 'todo', 0, 0, 3, null);
	insTask.run('Monter la nouvelle étagère', null, null, 2, 'done', 45, 9, 4, `${daysAgo(2)} 14:30:00`);
});

seed();

// 6. Boutique : (ré)initialise le catalogue, équipe un cosmétique de démo.
seedShop();
const cap = db.prepare(
	`SELECT r.id, r.category FROM rewards r WHERE r.kind='cosmetic' AND r.category IS NOT NULL ORDER BY r.cost ASC LIMIT 1`
).get() as { id: number; category: string } | undefined;
if (cap) {
	db.prepare(`UPDATE rewards SET claimed_at = datetime('now') WHERE id=?`).run(cap.id);
	db.prepare(`INSERT OR IGNORE INTO owned_cosmetics (reward_id) VALUES (?)`).run(cap.id);
	const col = {
		theme: 'equipped_theme_id',
		avatar_skin: 'equipped_skin_id',
		accessory: 'equipped_accessory_id',
		badge_frame: 'equipped_frame_id'
	}[cap.category];
	if (col) db.prepare(`UPDATE user_state SET ${col}=? WHERE id=1`).run(cap.id);
}

// 7. Débloque les succès mérités par le profil de démo, puis fige les compteurs.
runAchievementChecks();
db.prepare(`UPDATE user_state SET total_xp=12000, coins=640, freezes=2 WHERE id=1`).run();

console.log('✅ Données de démo insérées dans', process.env.DB_PATH ?? 'data/habitquest.db');
