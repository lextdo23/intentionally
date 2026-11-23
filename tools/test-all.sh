#!/bin/sh
# Runs every test, six at a time (about 3 minutes), then retries any that failed one by one, since a few wait on
# pictures loading and can run late when the machine is busy. Prints FAIL lines only for real failures.
cd "$(dirname "$0")/.." || exit 1
LOG=$(mktemp -d)
ls tests/*.test.cjs | xargs -P 6 -I{} sh -c 'timeout 300 node {} > "'"$LOG"'/$(basename {}).log" 2>&1 || echo {}' > "$LOG/retry"
fails=0
while read -r t; do
  [ -z "$t" ] && continue
  if ! timeout 300 node "$t" > "$LOG/again.log" 2>&1; then echo "FAIL $t"; grep FAIL "$LOG/again.log" | head -5; fails=1; fi
done < "$LOG/retry"
[ $fails = 0 ] && echo "All tests passed"
exit $fails
