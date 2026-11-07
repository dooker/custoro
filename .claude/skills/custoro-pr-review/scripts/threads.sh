#!/usr/bin/env bash
# The review threads of a pull request: list them, and resolve the ones that are fixed.
#
#   threads.sh list <pr> [--open]        one line per thread (--open: unresolved only):
#                                        thread id, open/resolved, outdated, file:line, the first
#                                        comment's id and author, whether it has a reply, its title
#   threads.sh resolve <thread id> ...   marks threads resolved (prints each one's new state)
#
# The thread id (PRRT_...) is what resolve takes; the first comment's id is what a reply goes to:
#   gh api -X POST repos/<repo>/pulls/<pr>/comments/<comment id>/replies -f body="Fixed in <sha>: ..."
# REPO picks the repository (default dooker/custoro). Needs gh, logged in.

set -euo pipefail

repo=${REPO:-dooker/custoro}
owner=${repo%%/*}
name=${repo#*/}

usage() {
    sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
}

list() {
    local pr=${1:?pull request number}
    local only_open=${2:-}

    gh api graphql -F owner="$owner" -F name="$name" -F pr="$pr" -f query='
        query($owner: String!, $name: String!, $pr: Int!) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $pr) {
              reviewThreads(first: 100) {
                nodes {
                  id isResolved isOutdated path line originalLine
                  comments(first: 50) { nodes { databaseId author { login } body } }
                }
              }
            }
          }
        }' --jq '
        .data.repository.pullRequest.reviewThreads.nodes[]
        | select(if "'"$only_open"'" == "--open" then .isResolved | not else true end)
        | .comments.nodes as $c
        | [
            .id,
            (if .isResolved then "resolved" else "open" end),
            (if .isOutdated then "outdated" else "current" end),
            "\(.path):\(.line // .originalLine)",
            "comment \($c[0].databaseId) by \($c[0].author.login)",
            (if ([$c[1:][] | select(.author.login != $c[0].author.login)] | length) > 0
                then "replied" else "no reply" end),
            ($c[0].body | split("\n")[0] | .[0:90])
          ]
        | join(" | ")'
}

resolve() {
    [ $# -gt 0 ] || usage

    local thread
    for thread in "$@"; do
        gh api graphql -F id="$thread" -f query='
            mutation($id: ID!) {
              resolveReviewThread(input: { threadId: $id }) { thread { id isResolved } }
            }' --jq '.data.resolveReviewThread.thread | "\(.id) resolved=\(.isResolved)"'
    done
}

case "${1:-}" in
    list) shift; list "$@" ;;
    resolve) shift; resolve "$@" ;;
    *) usage ;;
esac
