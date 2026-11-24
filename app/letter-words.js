// Words in fingerspelled letters. Letters arrive one at a time and nothing marks where a word ends, so a run
// such as ILOVEYOU is compared with a list of known words and split where the whole run is made of them.
// Pure functions, no DOM: the page shows the result under the message as a suggestion and changes the
// message only when the user presses the button for it.

// Everyday English words, upper case. The page adds the labels of the sign vocabulary to this list.
export const COMMON_WORDS = ('A I AM AN AND ARE AS AT BE BUT BY CAN DO FOR FROM GO HAS HAVE HE HER HIM HIS HOW IF IN IS IT ME MY NO NOT OF ON OR OUR SHE SO THAT THE THEM THEN THERE THEY THIS TO US WAS WE WERE WHAT WHEN WHERE WHICH WHO WHY WILL WITH YES YOU YOUR ' +
  'HELLO HI BYE GOODBYE PLEASE THANK THANKS SORRY WELCOME OKAY OK FINE GOOD BAD GREAT NICE HAPPY SAD ANGRY TIRED SICK HUNGRY THIRSTY HURT PAIN COLD HOT WARM ' +
  'NAME HOME HOUSE SCHOOL WORK JOB CLASS STORE MARKET HOSPITAL CHURCH ROOM BATHROOM TOILET KITCHEN DOOR WINDOW TABLE CHAIR BED CAR BUS ROAD STREET CITY ' +
  'MOTHER FATHER MOM DAD SISTER BROTHER BABY CHILD CHILDREN SON DAUGHTER FAMILY FRIEND TEACHER STUDENT DOCTOR NURSE MAN WOMAN BOY GIRL PEOPLE PERSON DEAF HEARING ' +
  'EAT DRINK FOOD WATER MILK RICE BREAD COFFEE TEA FRUIT MEAT FISH EGG ' +
  'WANT NEED LIKE LOVE HELP KNOW THINK FEEL SEE LOOK HEAR SAY TELL ASK GIVE TAKE GET MAKE COME LEAVE STAY WAIT STOP START FINISH OPEN CLOSE SIT STAND WALK RUN SLEEP WAKE PLAY READ WRITE LEARN SIGN SPEAK TALK CALL MEET BUY PAY USE FIND LOSE WASH COOK ' +
  'TODAY TOMORROW YESTERDAY NOW LATER SOON AGAIN MORNING AFTERNOON EVENING NIGHT DAY WEEK MONTH YEAR TIME HOUR MINUTE ' +
  'ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN MANY MUCH MORE LESS SOME ALL NONE FEW ' +
  'BIG SMALL LONG SHORT NEW OLD YOUNG FAST SLOW EASY HARD RIGHT WRONG SAME DIFFERENT HERE THERE UP DOWN LEFT IN OUT ' +
  'BOOK PEN PAPER PHONE MONEY BAG SHOES CLOTHES SHIRT MEDICINE EMERGENCY AMBULANCE POLICE FIRE DANGER SAFE CAREFUL').split(' ');

const LETTERS = /^[A-Z]+$/;

// Splits one run of letters into known words that cover it completely, or returns null. Among the ways to do
// that it takes the one with the fewest words; the one-letter words A and I count a little more than a longer
// word, so AM is preferred to A + M-something.
export function splitLetters(run, known) {
  if (!LETTERS.test(run) || run.length > 60) return null;
  if (known.has(run)) return [run];
  const best = new Array(run.length + 1).fill(null);
  best[0] = {cost: 0, words: []};
  for (let end = 1; end <= run.length; end++) {
    for (let start = Math.max(0, end - 20); start < end; start++) {
      if (!best[start]) continue;
      const word = run.slice(start, end);
      if (!known.has(word)) continue;
      if (word.length === 1 && word !== 'A' && word !== 'I') continue;
      const cost = best[start].cost + (word.length === 1 ? 1.5 : 1);
      if (!best[end] || cost < best[end].cost) best[end] = {cost, words: [...best[start].words, word]};
    }
  }
  return best[run.length] ? best[run.length].words : null;
}

// Reads a message. Every part between spaces that is letters only is looked up: a known word stays, a run made
// of known words is split, anything else is left as it is. Returns the words found, the message with the splits
// applied, and whether that differs from the message as given.
export function wordsInMessage(message, words) {
  const known = words instanceof Set ? words : new Set(words);
  const parts = String(message || '').toUpperCase().split(/\s+/).filter(Boolean);
  const found = [], rebuilt = [];
  let split = false;
  for (const part of parts) {
    const tail = (part.match(/[.,!?]+$/) || [''])[0];
    const body = tail ? part.slice(0, -tail.length) : part;
    const pieces = splitLetters(body, known);
    if (pieces) {
      found.push(...pieces);
      if (pieces.length > 1) split = true;
      rebuilt.push(pieces.join(' ') + tail);
    } else rebuilt.push(part);
  }
  return {found, text: rebuilt.join(' '), split};
}
