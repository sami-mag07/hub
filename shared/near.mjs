// Eine Quelle für Client und Server: was gilt als erreichbar. Wir sitzen in
// Berlin und fahren durch Deutschland, remote geht immer. Alles andere bleibt
// im Tracker in Emil, bis es jemand bewusst anpinnt.
export const NEAR =
  /berlin|potsdam|brandenburg|deutschland|germany|\bDE\b|hamburg|münchen|munich|garching|köln|cologne|frankfurt|stuttgart|düsseldorf|leipzig|dresden|hannover|nürnberg|nuremberg|bremen|darmstadt|karlsruhe|heidelberg|mannheim|aachen|bonn|münster|dortmund|essen|bochum|jena|erlangen|freiburg|kiel|rostock|magdeburg|halle|saarbrücken|augsburg|regensburg|würzburg|kassel|bielefeld|braunschweig|wolfsburg|ulm|konstanz|tübingen|göttingen|mainz|wiesbaden|siemensstadt|online|remote|hybrid|virtuell|virtual/i

export function isNearLocation(location) {
  return !location || NEAR.test(location)
}
