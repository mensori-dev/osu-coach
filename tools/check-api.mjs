// Quick sanity check for osu! API v2 credentials.
// Usage: node --env-file=.env tools/check-api.mjs
const { OSU_CLIENT_ID, OSU_CLIENT_SECRET, OSU_USER } = process.env;

if (!OSU_CLIENT_ID || !OSU_CLIENT_SECRET) {
  console.error('Missing OSU_CLIENT_ID / OSU_CLIENT_SECRET');
  process.exit(1);
}

const tokenRes = await fetch('https://osu.ppy.sh/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    client_id: Number(OSU_CLIENT_ID),
    client_secret: OSU_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'public',
  }),
});

if (!tokenRes.ok) {
  console.error('Token request failed:', tokenRes.status, (await tokenRes.text()).slice(0, 300));
  process.exit(1);
}

const { access_token, expires_in } = await tokenRes.json();
console.log('token ok, expires in', expires_in, 's');

const headers = { Authorization: `Bearer ${access_token}`, Accept: 'application/json' };

const userRes = await fetch(`https://osu.ppy.sh/api/v2/users/${encodeURIComponent(OSU_USER || 'me')}/osu`, { headers });
if (!userRes.ok) {
  console.error('User request failed:', userRes.status, (await userRes.text()).slice(0, 300));
  process.exit(1);
}
const user = await userRes.json();

const bestRes = await fetch(`https://osu.ppy.sh/api/v2/users/${user.id}/scores/best?limit=100&mode=osu`, { headers });
const best = bestRes.ok ? await bestRes.json() : [];

const recentRes = await fetch(`https://osu.ppy.sh/api/v2/users/${user.id}/scores/recent?limit=20&mode=osu`, { headers });
const recent = recentRes.ok ? await recentRes.json() : [];

console.log(JSON.stringify({
  user: {
    id: user.id,
    username: user.username,
    country: user.country_code,
    pp: user.statistics.pp,
    global_rank: user.statistics.global_rank,
    accuracy: user.statistics.hit_accuracy,
    play_count: user.statistics.play_count,
    play_time: user.statistics.play_time,
    level: user.statistics.level?.current,
  },
  best_scores: best.length,
  best_top: best.slice(0, 3).map((s) => ({
    pp: Math.round(s.pp),
    acc: s.accuracy,
    stars: s.beatmap?.difficulty_rating,
    map: `${s.beatmapset?.artist} - ${s.beatmapset?.title} [${s.beatmap?.version}]`,
  })),
  recent_scores: recent.length,
  recent_top: recent.slice(0, 3).map((s) => ({
    pp: s.pp,
    acc: s.accuracy,
    stars: s.beatmap?.difficulty_rating,
    map: `${s.beatmapset?.artist} - ${s.beatmapset?.title} [${s.beatmap?.version}]`,
  })),
}, null, 2));
