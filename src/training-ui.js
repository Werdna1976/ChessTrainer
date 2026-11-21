import { lessons, topics } from './training.js';
import { isDue, focusFromGames } from './progress.js';

export function renderTrainingRoom(progress, records, challenges, solved, saved, practice, escape, button) {
  const dueLessons = lessons.filter(({ id }) => isDue(progress.lessons[id]));
  const dueChallenges = challenges.map((_, id) => id).filter((id) => isDue(progress.challenges[id]));
  const focus = focusFromGames(records);
  const target = topics.find(({ id }) => id === focus)?.name;
  const unfinished = lessons.filter(({ id }) => !progress.lessons[id]?.completed);
  const featured = dueLessons[0] || unfinished.find(({ topic }) => topic === focus) || unfinished[0] || lessons[0];
  const nextChallenge = !dueLessons.length && dueChallenges.length ? dueChallenges[0] : null;
  const featuredTitle = nextChallenge === null ? featured.name : challenges[nextChallenge].name;
  const featuredText = nextChallenge !== null || dueLessons.length ? 'Ready for a refresher. See how much you can recall before using a hint.'
    : target && featured.topic === focus ? 'A useful next step based on the ' + target.toLowerCase() + ' mistakes in your recent games.'
      : featured.description;
  const complete = lessons.length - unfinished.length;
  const attempts = [...Object.values(progress.lessons), ...Object.values(progress.challenges)];
  const clean = attempts.reduce((sum, item) => sum + item.clean, 0);
  const misses = attempts.reduce((sum, item) => sum + item.misses, 0);
  const hints = attempts.reduce((sum, item) => sum + item.hints, 0);
  const stats = [[complete + ' / ' + lessons.length, 'Lessons complete'], [solved.length + ' / ' + challenges.length, 'Challenges solved'],
    [clean, 'Clean solves', 'Completed without a hint or wrong move.'], [dueLessons.length + dueChallenges.length, 'Ready to review']];
  const lessonCards = lessons.map((lesson) => {
    const topic = topics.find(({ id }) => id === lesson.topic);
    const status = isDue(progress.lessons[lesson.id]) ? 'Review due' : progress.lessons[lesson.id]?.completed ? 'Completed' : '';
    return '<button class="study-lesson" data-action="lesson" data-value="' + lesson.id + '">'
      + '<span class="lesson-topic"><span class="lesson-icon" aria-hidden="true">' + topic.icon + '</span>' + topic.name
      + (status ? ' <span class="badge">' + status + '</span>' : '') + '</span>'
      + '<strong>' + escape(lesson.name) + '</strong><span>' + escape(lesson.description) + '</span></button>';
  }).join('');
  return '<section class="training-hero" aria-labelledby="training-feature"><div class="training-feature"><p class="training-kicker">Your next session</p>'
    + '<h2 id="training-feature">' + escape(featuredTitle) + '</h2><p>' + escape(featuredText) + '</p><div class="actions">'
    + (nextChallenge === null ? button('lesson', dueLessons.length ? 'Review lesson' : 'Open lesson', 'primary', featured.id)
      : button('open-challenge', 'Retry challenge', 'primary', nextChallenge))
    + '<a class="secondary" href="#challenges">Browse challenges</a></div></div></section>'
    + '<div class="study-columns"><section aria-labelledby="lesson-library"><div class="study-heading"><h2 id="lesson-library">Guided lessons</h2>'
    + '<p class="muted">Watch the idea, play it yourself, and learn what to look for next time.</p></div><div class="study-lessons">' + lessonCards + '</div></section>'
    + '<aside class="study-sidebar"><section class="card"><h2>Your practice</h2><div class="study-stats">'
    + stats.map(([value, label, title]) => '<div' + (title ? ' title="' + escape(title) + '"' : '') + '><strong>' + escape(value) + '</strong><span>' + label + '</span></div>').join('')
    + '</div>' + (misses || hints ? '<p class="study-log muted">' + misses + ' wrong ' + (misses === 1 ? 'move' : 'moves')
      + ' tried · ' + hints + (hints === 1 ? ' hint' : ' hints') + ' used</p>' : '')
    + (target || practice ? '<div class="tip"><strong>From your games</strong>'
      + (target ? '<p>' + escape(target) + ' is a recurring theme in your recent reviewed moves.</p>' : '')
      + (practice ? '<div class="actions">' + button('practice-position', 'Retry ' + practice.move, 'secondary', practice.key) + '</div>' : '') + '</div>' : '')
    + '</section><section class="card"><div class="card-head"><h2>Saved positions</h2><a class="text-button" href="#review">Game review</a></div>'
    + (saved.length ? '<div class="saved-positions">' + saved.map((position) => '<button class="study-saved" data-action="practice-position" data-value="'
      + escape(position.key) + '"><strong>' + escape(position.move) + '</strong><small>' + escape(position.name) + '</small></button>').join('') + '</div>'
      : '<p class="muted">Save a position from Game Review to replay it here.</p>') + '</section></aside></div>';
}
